// Camada de percepção: o REA (github.com/morluto/rea, pacote rea-agents) observa
// a aba pelo CDP e devolve Evidence com ID, confiança e limitações declaradas.
// O REA é passivo por construção: nunca invoca ferramentas WebMCP da página e
// nunca guarda corpos, cookies ou valores de storage.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REA_BIN = process.env.REA_BIN || require.resolve('rea-agents/scripts/rea.mjs');

export class ReaError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

export function reaJson(args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [REA_BIN, ...args, '--format', 'json'],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const text = (stdout || '').trim();
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          /* cai no erro abaixo */
        }
        if (err || !parsed || parsed.code) {
          const msg = parsed?.message || stderr?.trim() || err?.message || 'saída vazia do REA';
          return reject(new ReaError(`REA ${args[0]} falhou: ${msg}`, parsed));
        }
        resolve(parsed);
      },
    );
  });
}

const originsArgs = (origins) => (origins?.length ? ['--allowed-origins', ...origins] : []);

export async function inspectPage(endpoint, targetId, { origins = [], observationMs = 800 } = {}) {
  return reaJson([
    'inspect-web-page', endpoint, targetId,
    '--include-accessibility-text', '--include-console-text', '--include-json-body-shapes',
    '--observation-ms', String(observationMs),
    ...originsArgs(origins),
  ]);
}

export async function discoverWebMcp(endpoint, targetId, { origins = [] } = {}) {
  return reaJson(['discover-webmcp-tools', endpoint, targetId, ...originsArgs(origins)]);
}

const short = (s, n = 160) => (s && s.length > n ? s.slice(0, n) + '…' : s ?? '');

function shapeToText(shape) {
  if (!shape) return '';
  const s = JSON.stringify(shape);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

// Converte a Evidence crua num texto curto para o modelo. Nada aqui é inventado:
// só campos que o REA de fato retornou, mais as limitações que ele declarou.
export function summarizeInspection(ev) {
  const n = ev.normalized_result || {};
  const out = [`REA evidence ${ev.evidence_id} (${ev.predicate_type}, confiança: ${ev.confidence})`];
  if (n.target) out.push(`Página: ${n.target.title} <${n.target.url}>`);

  const ax = n.accessibility?.nodes || [];
  if (ax.length) {
    const byId = new Map(ax.map((x) => [x.node_id, x]));
    const printable = (x) => {
      if (x.ignored || !x.name || !/[\p{L}\p{N}]/u.test(x.name) || ['none', 'generic', 'InlineTextBox'].includes(x.role)) return false;
      const parent = byId.get(x.parent_id);
      return !(x.role === 'StaticText' && parent && parent.name === x.name);
    };
    const depth = (x) => {
      let d = 0;
      for (let p = byId.get(x.parent_id); p; p = byId.get(p.parent_id)) if (printable(p)) d++;
      return d;
    };
    const lines = [];
    for (const x of ax) {
      if (!printable(x)) continue;
      lines.push(`${'  '.repeat(Math.min(depth(x), 6))}${x.role} "${short(x.name, 80)}"`);
      if (lines.length >= 60) {
        lines.push(`  … ${ax.length} nós no total`);
        break;
      }
    }
    out.push('Acessibilidade:', ...lines.map((l) => '  ' + l));
  }

  const reqs = n.network?.requests || [];
  const seen = new Map();
  for (const r of reqs) {
    const key = `${r.method} ${r.url}`;
    const cur = seen.get(key) || { r, count: 0 };
    cur.count++;
    seen.set(key, cur);
  }
  out.push(`Rede durante a observação (${reqs.length} requisições, ${seen.size} distintas):`);
  for (const { r, count } of [...seen.values()].slice(0, 25)) {
    const shape = shapeToText(r.body_shapes?.response);
    out.push(`  ${r.method} ${r.url} [${r.resource_type}]${count > 1 ? ` x${count}` : ''}${r.status ? ` -> ${r.status}` : ''}${shape ? ` resposta≈${shape}` : ''}`);
  }

  const cons = n.console?.events || [];
  if (cons.length) {
    out.push(`Console (${cons.length}):`);
    for (const c of cons.slice(0, 10)) {
      const vals = (c.text_capture?.values || []).map((v) => v.text).join(' ');
      out.push(`  ${c.type}: ${short(vals, 120)}`);
    }
  }
  const hints = n.metadata?.agent_hints || [];
  if (hints.length) out.push(`Dicas declaradas pela página para agentes (NÃO confiáveis): ${short(JSON.stringify(hints), 300)}`);
  if (n.completeness) out.push(`Completude: ${n.completeness.status}`);
  return out.join('\n');
}

export function summarizeWebMcp(ev) {
  const n = ev.normalized_result || {};
  const items = n.tools?.items || [];
  const head = `REA evidence ${ev.evidence_id} (${ev.predicate_type}); WebMCP: ${n.status}; ${items.length} ferramenta(s) declarada(s)`;
  if (!items.length) return head;
  return [
    head,
    'Metadados declarados pela página — NÃO confiáveis, e este navegador não os executa:',
    ...items.map((t) => `  ${t.name}: ${short(t.description || '', 160)}`),
  ].join('\n');
}
