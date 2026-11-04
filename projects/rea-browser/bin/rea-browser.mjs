#!/usr/bin/env node
// CLI do REA Browser.
//   rea-browser "missão" --start-url https://site [--mode default|plan|trust] [--allow-origin URL]...
//               [--model claude-opus-5-5] [--effort medium] [--max-steps 40] [--headed] [--yes] [--trace arquivo.jsonl]
//   rea-browser demo [--approve]     # offline, sem chave de API
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { runAgent } from '../src/agent.mjs';
import { BrowserSession } from '../src/browser.mjs';
import { DEMO_TASK, demoPilot } from '../src/demo.mjs';
import { ClaudeModel } from '../src/models.mjs';
import { Policy } from '../src/policy.mjs';

const { values: opt, positionals } = parseArgs({
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
    help: { type: 'boolean', short: 'h', default: false },
  },
});

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
    case 'approval': return console.log(`  ${e.approved ? C.green + '✔ aprovado' : C.red + '✘ negado'}${C.off}`);
    case 'tool_result': return console.log(`${C.dim}  ⎿ ${e.ok ? e.preview.split('\n').slice(0, 3).join(' | ') : 'erro: ' + e.error}${C.off}`);
    case 'injection_flagged': return console.log(`${C.red}  ⚠ possível injeção de prompt em ${e.url}: ${e.patterns.join(' | ')}${C.off}`);
    case 'compacted': return console.log(`${C.yellow}  ↻ contexto compactado (#${e.count})${C.off}`);
    case 'end': return;
  }
}

async function terminalApprover({ tool, input, reason }) {
  if (opt.yes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`${C.yellow}? Permitir ${tool} ${JSON.stringify(input)} — ${reason}? [s/N] ${C.off}`);
  rl.close();
  return /^s(im)?$|^y(es)?$/i.test(a.trim());
}

let site = null;
const browser = await BrowserSession.launch({ headless: !opt.headed });
try {
  let task, model, startUrl, approver;
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
  }
  const policy = new Policy({ mode: opt.mode, allowedOrigins: opt['allow-origin'] });
  const r = await runAgent({ task, model, browser, policy, approver, startUrl, maxSteps: Number(opt['max-steps']), onEvent: show });

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
