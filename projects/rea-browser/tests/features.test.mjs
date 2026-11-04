// Recursos inspirados em outros agentes/navegadores. Chromium + REA reais, piloto roteirizado.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { runAgent } from '../src/agent.mjs';
import { BrowserSession } from '../src/browser.mjs';
import { lastEvidence, ScriptedModel } from '../src/models.mjs';
import { Policy } from '../src/policy.mjs';
import { startFixtureSite } from './fixture-site.mjs';

let site, browser;
before(async () => {
  site = await startFixtureSite();
  browser = await BrowserSession.launch();
});
after(async () => {
  await browser?.close();
  await site?.close();
});

const run = (o) => runAgent({ browser, policy: new Policy({ mode: o.mode || 'default' }), startUrl: site.origin, maxSteps: 20, ...o });
const end = () => ({ name: 'done', input: { status: 'blocked', answer: 'fim', evidence: ['obs_1'] } });

test('extract: tabela vira objetos pelo cabeçalho e listas fora do nav', async () => {
  let seen = '';
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/comparar' } }),
    () => ({ name: 'extract', input: {} }),
    (t) => ((seen = t), { name: 'done', input: { status: 'completed', answer: 'ok', evidence: [lastEvidence(t)] } }),
  ]);
  const r = await run({ task: 'comparar', model });
  assert.equal(r.status, 'completed');
  const json = JSON.parse(seen.slice(seen.indexOf('{'), seen.lastIndexOf('}') + 1));
  assert.deepEqual(json.tables[0].rows[0], { Produto: 'Teclado Mecânico', 'Preço': 'R$ 349,90', Estoque: '7' });
  assert.equal(json.tables[0].rows.length, 3);
  assert.deepEqual(json.lists, [['Frete grátis acima de R$ 299', 'Troca em 30 dias']]);
});

test('wait_for: espera o conteúdo atrasado em vez de reler em loop', async () => {
  let seen = '', fail = '';
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/relampago' } }),
    () => ({ name: 'wait_for', input: { text: 'Cupom liberado', timeout_ms: 5000 } }),
    (t) => ((seen = t), { name: 'wait_for', input: { text: 'nunca vai aparecer', timeout_ms: 300 } }),
    (t) => ((fail = t), end()),
  ]);
  await run({ task: 'cupom', model });
  assert.match(seen, /RAIO20/);
  assert.match(fail, /não apareceu em 300 ms/);
});

test('ask_user: sem humano o agente é avisado; com humano recebe a resposta', async () => {
  let none = '', answer = '', after = '';
  const steps = () => [
    () => ({ name: 'navigate', input: { url: site.origin + '/produtos' } }),
    () => ({ name: 'ask_user', input: { question: 'Qual produto você prefere?' } }),
    (t) => ((answer = t), { name: 'ask_user', input: { question: 'Faça login e me avise', handoff: true } }),
    (t) => ((after = t), end()),
  ];
  await run({ task: 'escolher', model: new ScriptedModel([steps()[0], steps()[1], (t) => ((none = t), end())]) });
  assert.match(none, /não há humano disponível/);

  const asked = [];
  await run({
    task: 'escolher',
    model: new ScriptedModel(steps()),
    asker: async (q) => {
      asked.push(q);
      if (q.handoff) await browser.page.goto(site.origin + '/carrinho'); // o humano navegou
      return q.handoff ? 'pronto' : 'o monitor';
    },
  });
  assert.equal(asked.length, 2);
  assert.match(answer, /<user_answer>\no monitor\n<\/user_answer>/);
  assert.match(after, /devolveu o controle[\s\S]*Título: Carrinho/);
});

test('aprovar com "sempre" não pergunta de novo a mesma ação na sessão', async () => {
  site.carrinho.length = 0;
  const pedidosAntes = site.pedidos.length;
  const asked = [];
  const buy = () => [
    () => ({ name: 'navigate', input: { url: site.origin + '/carrinho' } }),
    (t) => ({ name: 'click', input: { ref: t.match(/\[(e\d+)\] button "Finalizar compra"/)[1] } }),
  ];
  const [nav, click] = buy();
  const model = new ScriptedModel([nav, click, nav, click, end]);
  await run({ task: 'comprar duas vezes', model, approver: async (q) => (asked.push(q.reason), 'always') });
  assert.equal(asked.length, 1);
  assert.equal(site.pedidos.length, pedidosAntes + 2);
});

test('"sempre" não vale para campos de senha', async () => {
  const asked = [];
  const nav = () => ({ name: 'navigate', input: { url: site.origin + '/login' } });
  const type = (t) => ({ name: 'type', input: { ref: t.match(/\[(e\d+)\] textbox "Senha"/)[1], text: 'x' } });
  const model = new ScriptedModel([nav, type, nav, type, end]);
  await run({ task: 'login', model, approver: async (q) => (asked.push(q.reason), 'always') });
  assert.equal(asked.length, 2);
});
