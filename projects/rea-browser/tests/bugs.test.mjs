// Regressões: um teste por bug encontrado na auditoria. Cada um falhava antes do fix.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { estimateTokens, runAgent } from '../src/agent.mjs';
import { BrowserSession } from '../src/browser.mjs';
import { refFor, ScriptedModel } from '../src/models.mjs';
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

test('bug 1: rea_inspect enxerga a API de outra origem que a página chamou', async () => {
  let seen = '';
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/frete' } }),
    () => ({ name: 'rea_inspect', input: {} }),
    (t) => ((seen = t), end()),
  ]);
  await run({ task: 'frete', model });
  assert.match(seen, new RegExp(`GET ${site.external}/api/frete`));
});

test('bug 2: Enter num campo que envia para outra origem pede aprovação', async () => {
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/newsletter' } }),
    (t) => ({ name: 'type', input: { ref: refFor(t, 'e-mail'), text: 'a@b.c', submit: true } }),
    end,
  ]);
  const r = await run({ task: 'assinar', model });
  assert.equal(site.coletados.length, 0, 'o formulário não pode ter chegado à outra origem');
  assert.match(r.state.denials[0]?.reason || '', /fora do escopo/);
});

test('bug 3a: redirecionamento para fora do escopo é barrado', async () => {
  let seen = '';
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/sair' } }),
    (t) => ((seen = t), end()),
  ]);
  await run({ task: 'sair', model });
  assert.ok(!browser.url().startsWith(site.external), `não deveria estar em ${browser.url()}`);
  assert.match(seen, /bloquead/i);
});

test('bug 3b: navegação por JavaScript para fora do escopo é barrada', async () => {
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/oferta' } }),
    (t) => ({ name: 'click', input: { ref: refFor(t, 'Ver oferta') } }),
    end,
  ]);
  await run({ task: 'oferta', model });
  assert.ok(!browser.url().startsWith(site.external), `não deveria estar em ${browser.url()}`);
});

test('bug 3c: com aprovação humana a navegação para outra origem funciona', async () => {
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.external + '/landing' } }),
    end,
  ]);
  await run({ task: 'ir', model, approver: async () => true });
  assert.ok(browser.url().startsWith(site.external), browser.url());
});

test('bug 4: confirm() é mostrado ao agente e só é aceito com aprovação', async () => {
  let seen = '';
  const model = () => new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/conta' } }),
    (t) => ({ name: 'click', input: { ref: refFor(t, 'Gerenciar dados') } }),
    (t) => ((seen = t), end()),
  ]);
  await run({ task: 'conta', model: model() });
  assert.match(seen, /Tem certeza que quer apagar a conta/);
  assert.equal(site.contas.apagada, false);
  const asked = [];
  await run({ task: 'conta', model: model(), approver: async (q) => (asked.push(q.reason), true) });
  assert.ok(asked.some((r) => /Tem certeza/.test(r)), 'aceitar o confirm deveria pedir aprovação');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(site.contas.apagada, true);
});

test('bug 5: link que abre nova aba é seguido', async () => {
  let seen = '';
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/ajuda' } }),
    (t) => ({ name: 'click', input: { ref: refFor(t, 'nova aba') } }),
    (t) => ((seen = t), end()),
  ]);
  await run({ task: 'ajuda', model });
  assert.match(seen, /Título: Produtos/);
});

test('bug 6: captura de tela não infla a estimativa de tokens', () => {
  const big = 'A'.repeat(400_000);
  const msgs = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: [
    { type: 'text', text: 'shot' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: big } },
  ] }] }];
  assert.ok(estimateTokens(msgs) < 5_000, `estimou ${estimateTokens(msgs)}`);
});

test('bug 7: find lê a página como ela está agora', async () => {
  let seen = '';
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/' } }),
    async () => {
      await browser.page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<p>Cupom: BLACK10</p>'));
      return { name: 'find', input: { pattern: 'cupom' } };
    },
    (t) => ((seen = t), end()),
  ]);
  await run({ task: 'cupom', model });
  assert.match(seen, /BLACK10/);
});

test('bug 8: a mesma chamada repetida sem progresso encerra com status loop', async () => {
  let ref;
  const model = new ScriptedModel([
    () => ({ name: 'navigate', input: { url: site.origin + '/carrinho' } }),
    (t) => ({ name: 'click', input: { ref: (ref ??= refFor(t, 'Finalizar compra')) } }), // repete para sempre
  ]);
  const r = await run({ task: 'comprar', model, maxSteps: 30 });
  assert.equal(r.status, 'loop');
  assert.ok(r.state.steps < 10, `gastou ${r.state.steps} passos`);
});

test('bug 9: CLI rejeita --max-steps e --mode inválidos com mensagem clara', () => {
  for (const args of [['x', '--max-steps', 'abc'], ['x', '--mode', 'yolo']]) {
    const p = spawnSync(process.execPath, ['bin/rea-browser.mjs', ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
    assert.equal(p.status, 1, p.stderr);
    assert.match(p.stderr, /inválid/);
    assert.doesNotMatch(p.stderr, /at .*\.mjs:\d+/, 'sem stack trace');
  }
});
