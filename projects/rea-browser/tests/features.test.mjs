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
