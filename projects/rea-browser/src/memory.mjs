// Memória por site: o CLAUDE.md dos sites. Uma lista curta de dicas por origem
// ("o frete fica no rodapé", "a busca não aceita acento"), que o agente grava com
// `remember` e recebe ao entrar na origem numa execução futura.
// Risco: uma página poderia tentar plantar "dicas". Por isso dicas com cara de
// injeção são recusadas, a memória chega marcada como não verificada e o
// arquivo tem tamanho limitado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectInjection } from './policy.mjs';

const MAX_TIPS = 50;
const MAX_TIP_CHARS = 300;

export class SiteMemory {
  constructor({ dir = path.join(os.homedir(), '.rea-browser', 'memory') } = {}) {
    this.dir = dir;
  }

  fileFor(origin) {
    const u = new URL(origin);
    const name = `${u.protocol.replace(':', '')}_${u.host}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.dir, `${name}.md`);
  }

  tips(origin) {
    try {
      return fs.readFileSync(this.fileFor(origin), 'utf8').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  add(origin, tip) {
    const clean = tip.replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('dica vazia');
    if (clean.length > MAX_TIP_CHARS) throw new Error(`dica longa demais (${clean.length} > ${MAX_TIP_CHARS} caracteres)`);
    const hits = detectInjection(clean);
    if (hits.length) throw new Error(`dica recusada: parece instrução injetada (${hits.join(', ')})`);
    const date = new Date().toISOString().slice(0, 10);
    const existing = this.tips(origin).filter((t) => t.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, '') !== clean);
    const all = [...existing, `${clean} (${date})`].slice(-MAX_TIPS);
    fs.mkdirSync(this.dir, { recursive: true });
    const file = this.fileFor(origin);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `# ${new URL(origin).origin}\n\n${all.map((t) => `- ${t}`).join('\n')}\n`);
    fs.renameSync(tmp, file); // escrita atômica: duas execuções não corrompem o arquivo
    return all.length;
  }
}
