// Ponta a ponta: Chromium real + REA real + loja local. O "modelo" é o piloto
// roteirizado (ScriptedModel), para os testes rodarem sem chave de API.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { runAgent } from '../src/agent.mjs';
import { BrowserSession } from '../src/browser.mjs';
import { DEMO_TASK, demoPilot } from '../src/demo.mjs';
import { lastEvidence, refFor, ScriptedModel } from '../src/models.mjs';
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

test('demo: REA acha o fetch de estoque, compra é negada sem humano, done cita evidência', async () => {
  const events = [];
  const r = await run({ task: DEMO_TASK, model: demoPilot(), onEvent: (e) => events.push(e) });
  assert.equal(r.status, 'blocked');
  assert.match(r.answer, /R\$ 349,90/);
  assert.equal(r.evidence.length, 2);
  const reaId = r.evidence.find((e) => e.startsWith('ev_'));
  assert.ok(reaId && r.ledger.items.get(reaId).operation === 'inspect_web_page');
  assert.ok(r.state.notes.some((n) => /\/api\/estoque\/1/.test(n.fact)), 'o REA deveria ter visto /api/estoque/1');
  assert.deepEqual(r.state.denials.map((d) => d.tool), ['click']);
  assert.equal(site.pedidos.length, 0, 'nenhum pedido pode ter sido feito');
  assert.equal(site.carrinho.length, 1);
});

test('com aprovação humana a mesma compra acontece', async () => {
  site.carrinho.length = 0;
  const asked = [];
  const r = await run({ task: DEMO_TASK, model: demoPilot(), approver: async (q) => (asked.push(q.reason), true) });
  assert.equal(r.status, 'completed');
  assert.equal(asked.length, 1);
  assert.match(asked[0], /Finalizar compra/);
  assert.equal(site.pedidos.length, 1);
});

test('injeção de prompt: conteúdo marcado e navegação para fora do escopo negada', async () => {
  const events = [];
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/promo' } }),
    () => ({ name: 'navigate', input: { url: 'http://evil.example/steal' } }), // "obedece" a página
    () => ({ name: 'done', input: { status: 'blocked', answer: 'Recusei seguir a página.', evidence: ['obs_1'] } }),
  ]);
  const r = await run({ task: 'Veja as promoções', model, onEvent: (e) => events.push(e) });
  assert.ok(events.some((e) => e.type === 'injection_flagged'));
  assert.equal(r.state.denials[0].tool, 'navigate');
  assert.match(r.state.denials[0].reason, /fora do escopo/);
  assert.equal(browser.url(), site.origin + '/promo');
});

test('modo plan: observa mas não age', async () => {
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/produtos' } }),
    (t) => ({ name: 'click', input: { ref: refFor(t, 'Monitor') } }),
    (t) => ({ name: 'done', input: { status: 'blocked', answer: 'modo plan', evidence: ['obs_1'] } }),
  ]);
  const r = await run({ task: 'abrir monitor', model, mode: 'plan' });
  assert.match(r.state.denials[0].reason, /modo plan/);
  assert.match(browser.url(), /\/produtos$/);
});

test('senha nunca é digitada sem humano, nem em trust', async () => {
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/login' } }),
    (t) => ({ name: 'type', input: { ref: refFor(t, 'Senha'), text: 'hunter2' } }),
    () => ({ name: 'done', input: { status: 'blocked', answer: 'precisa de aprovação', evidence: ['obs_1'] } }),
  ]);
  const r = await run({ task: 'entrar', model, mode: 'trust' });
  assert.match(r.state.denials[0].reason, /campo sensível/);
  const value = await browser.page.locator('input[type=password]').inputValue();
  assert.equal(value, '');
});

test('verificação: done sem evidência ou com ID inventado é recusado e o loop continua', async () => {
  const seen = [];
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/produtos' } }),
    () => ({ name: 'done', input: { status: 'completed', answer: 'custa R$ 1', evidence: [] } }),
    (t) => (seen.push(t), { name: 'done', input: { status: 'completed', answer: 'custa R$ 1', evidence: ['obs_99'] } }),
    (t) => (seen.push(t), { name: 'done', input: { status: 'completed', answer: 'Monitor 27" custa R$ 1.899,00', evidence: ['obs_1'] } }),
  ]);
  const r = await run({ task: 'preço do monitor', model });
  assert.match(seen[0], /precisa citar ao menos uma evidência/);
  assert.match(seen[1], /inexistentes obs_99/);
  assert.equal(r.status, 'completed');
});

test('ref velho é recusado com instrução para refazer o snapshot', async () => {
  const seen = [];
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/' } }),
    () => ({ name: 'click', input: { ref: 'e999' } }),
    (t) => (seen.push(t), { name: 'done', input: { status: 'blocked', answer: 'x', evidence: ['obs_1'] } }),
  ]);
  await run({ task: 'x', model });
  assert.match(seen[0], /não existe na página atual/);
});

test('compactação recomeça do resumo e mantém a missão andando', async () => {
  const events = [];
  let sawSummary = false;
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/produtos' } }),
    () => ({ name: 'note', input: { fact: 'há 3 produtos', evidence: 'obs_1' } }),
    // Último passo se repete: relê a página até a compactação acontecer.
    (t, msgs) => {
      if (msgs.length > 1) return { name: 'snapshot', input: {} };
      sawSummary = /compactado/.test(msgs[0].content) && /há 3 produtos \(obs_1\)/.test(msgs[0].content);
      return { name: 'done', input: { status: 'completed', answer: '3 produtos', evidence: ['obs_1'] } };
    },
  ]);
  const r = await run({ task: 'contar produtos', model, contextBudgetTokens: 1500, onEvent: (e) => events.push(e) });
  assert.ok(events.some((e) => e.type === 'compacted'));
  assert.ok(sawSummary, 'o modelo deveria receber o resumo com a nota');
  assert.equal(r.status, 'completed');
});

test('webmcp_discover passa pelo REA e devolve evidência', async () => {
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/' } }),
    () => ({ name: 'webmcp_discover', input: {} }),
    (t) => ({ name: 'done', input: { status: 'completed', answer: t.match(/WebMCP: \w+; \d+ ferramenta/)[0], evidence: [lastEvidence(t, 'ev')] } }),
  ]);
  const r = await run({ task: 'listar ferramentas', model });
  assert.equal(r.status, 'completed');
  assert.match(r.answer, /0 ferramenta/);
});
