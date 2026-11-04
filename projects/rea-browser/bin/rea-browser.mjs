#!/usr/bin/env node
// CLI do REA Browser.
//   rea-browser "missão" --start-url https://site [--mode default|plan|trust] [--allow-origin URL]...
//               [--model claude-opus-5-5] [--effort medium] [--max-steps 40] [--headed] [--yes] [--trace arquivo.jsonl]
//               [--memory-dir DIR | --no-memory]
//   rea-browser demo [--approve]     # offline, sem chave de API
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { runAgent } from '../src/agent.mjs';
import { BrowserSession } from '../src/browser.mjs';
import { DEMO_TASK, demoPilot } from '../src/demo.mjs';
import { ClaudeModel } from '../src/models.mjs';
import { SiteMemory } from '../src/memory.mjs';
import { MODES, Policy } from '../src/policy.mjs';

const die = (msg) => {
  console.error(`rea-browser: ${msg}`);
  process.exit(1);
};

let opt, positionals;
try {
  ({ values: opt, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'start-url': { type: 'string' },
      mode: { type: 'string', default: 'default' },
      'allow-origin': { type: 'string', multiple: true, default: [] },
      model: { type: 'string', default: 'claude-opus-5-5' },
      effort: { type: 'string', default: 'medium' },
      'max-steps': { type: 'string', default: '40' },
      headed: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      approve: { type: 'boolean', default: false },
      trace: { type: 'string' },
      'memory-dir': { type: 'string' },
      'no-memory': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (e) {
  die(`argumento inválido: ${e.message}`);
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
if (!MODES.includes(opt.mode)) die(`--mode inválido: ${opt.mode} (use ${MODES.join(', ')})`);
if (!EFFORTS.includes(opt.effort)) die(`--effort inválido: ${opt.effort} (use ${EFFORTS.join(', ')})`);
if (!/^[1-9]\d*$/.test(opt['max-steps'])) die(`--max-steps inválido: ${opt['max-steps']} (use um inteiro positivo)`);
for (const o of [...opt['allow-origin'], ...(opt['start-url'] ? [opt['start-url']] : [])]) {
  try {
    new URL(o);
  } catch {
    die(`URL inválida: ${o}`);
  }
}

if (opt.help || positionals.length === 0) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 6).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(positionals.length === 0 && !opt.help ? 1 : 0);
}

const C = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', off: '\x1b[0m' };
const traceFile = opt.trace && fs.createWriteStream(path.resolve(opt.trace));

function show(e) {
  traceFile?.write(JSON.stringify(e) + '\n');
  switch (e.type) {
    case 'start': return console.log(`${C.cyan}▶ missão:${C.off} ${e.task}\n${C.dim}  modo=${e.mode} escopo=${e.scope.join(', ') || '(livre)'}${C.off}`);
    case 'assistant_text': return console.log(`${C.cyan}●${C.off} ${e.text}`);
    case 'todos': return console.log(e.items.map((t) => `${C.dim}  ${t.status === 'completed' ? '☒' : t.status === 'in_progress' ? '◐' : '☐'} ${t.content}${C.off}`).join('\n'));
    case 'tool_call': {
      const col = e.decision === 'allow' ? C.green : e.decision === 'ask' ? C.yellow : C.red;
      return console.log(`${col}⏺ ${e.tool}${C.off}(${JSON.stringify(e.input)}) ${C.dim}[${e.decision}: ${e.reason}]${C.off}`);
    }
    case 'approval': return console.log(`  ${e.approved ? C.green + (e.remembered ? '✔ aprovado (lembrado)' : e.always ? '✔ aprovado para a sessão' : '✔ aprovado') : C.red + '✘ negado'}${C.off}`);
    case 'dialog': return console.log(`${C.yellow}  ⚑ diálogo ${e.dialog}: ${JSON.stringify(e.message)} [${e.decision}]${C.off}`);
    case 'navigation_blocked': return console.log(`${C.red}  ⛔ navegação bloqueada (${e.via}): ${e.url}${C.off}`);
    case 'loop_warning': return console.log(`${C.yellow}  ↺ mesma chamada ${e.repeats}x sem progresso${C.off}`);
    case 'ask_user': return;
    case 'memory_loaded': return console.log(`${C.dim}  ✎ ${e.tips} dica(s) de memória para ${e.origin}${C.off}`);
    case 'memory_saved': return console.log(`${C.dim}  ✎ lembrado para ${e.origin}: ${e.tip}${C.off}`);
    case 'tool_result': return console.log(`${C.dim}  ⎿ ${e.ok ? e.preview.split('\n').slice(0, 3).join(' | ') : 'erro: ' + e.error}${C.off}`);
    case 'injection_flagged': return console.log(`${C.red}  ⚠ possível injeção de prompt em ${e.url}: ${e.patterns.join(' | ')}${C.off}`);
    case 'compacted': return console.log(`${C.yellow}  ↻ contexto compactado (#${e.count})${C.off}`);
    case 'end': return;
  }
}

async function prompt(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(text)).trim();
  } finally {
    rl.close();
  }
}

async function terminalApprover({ tool, input, reason }) {
  if (opt.yes) return true;
  if (!process.stdin.isTTY) return false;
  const a = await prompt(`${C.yellow}? Permitir ${tool} ${JSON.stringify(input)} — ${reason}? [s]im / [a] sempre nesta sessão / [N]ão ${C.off}`);
  if (/^a(lways|sempre)?$/i.test(a)) return 'always';
  return /^s(im)?$|^y(es)?$/i.test(a);
}

async function terminalAsker({ question, handoff }) {
  if (!process.stdin.isTTY) return null;
  const hint = handoff ? ' (o controle é seu: aja na janela — use --headed — e responda quando terminar)' : '';
  return prompt(`${C.cyan}? O agente pergunta: ${question}${hint}\n> ${C.off}`);
}

let site = null;
const browser = await BrowserSession.launch({ headless: !opt.headed });
try {
  let task, model, startUrl, approver, asker = null;
  if (positionals[0] === 'demo') {
    const { startFixtureSite } = await import('../tests/fixture-site.mjs');
    site = await startFixtureSite();
    task = DEMO_TASK;
    model = demoPilot();
    startUrl = site.origin;
    approver = opt.approve ? async () => true : null;
  } else {
    task = positionals.join(' ');
    startUrl = opt['start-url'] || null;
    model = new ClaudeModel({ model: opt.model, effort: opt.effort });
    approver = terminalApprover;
    asker = terminalAsker;
  }
  const policy = new Policy({ mode: opt.mode, allowedOrigins: opt['allow-origin'] });
  const memory = opt['no-memory'] || positionals[0] === 'demo' ? null : new SiteMemory(opt['memory-dir'] ? { dir: path.resolve(opt['memory-dir']) } : {});
  const r = await runAgent({ task, model, browser, policy, approver, asker, memory, startUrl, maxSteps: Number(opt['max-steps']), onEvent: show });

  console.log(`\n${r.status === 'completed' ? C.green : C.yellow}■ ${r.status}${C.off}`);
  if (r.answer) console.log(r.answer);
  if (r.evidence?.length) {
    console.log(`${C.dim}evidências:${C.off}`);
    for (const id of r.evidence) console.log(`${C.dim}  ${id}: ${JSON.stringify(r.ledger.items.get(id))}${C.off}`);
  }
  if (r.state.denials.length) console.log(`${C.dim}ações negadas: ${r.state.denials.map((d) => `${d.tool} (${d.reason})`).join('; ')}${C.off}`);
  if (model.usage) console.log(`${C.dim}tokens: ${JSON.stringify(model.usage)}${C.off}`);
  process.exitCode = r.status === 'completed' || r.status === 'blocked' ? 0 : 2;
} finally {
  await browser.close();
  await site?.close();
  traceFile?.end();
}
