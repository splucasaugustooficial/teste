// Gravar e repetir (inspirado no cache de ações do Stagehand e nos workflows do
// Browser Use). Uma execução que deu certo vira uma receita; a receita roda de
// novo sem modelo, sem tokens e de forma determinística.
//
// Diferenças de um gravador de macro comum:
// - o alvo é semântico (papel + rótulo, como no snapshot), não o ref nem um
//   seletor CSS: a receita sobrevive a mudanças de layout e de ordem;
// - a repetição roda DENTRO do runAgent, então passa pelo mesmo portão de
//   permissões, guarda de navegação, detecção de loop e ledger de evidências;
// - texto digitado em campo sensível nunca é gravado: na repetição, pede ao humano.
import { isSensitiveField } from './policy.mjs';

const PAGE_TOOLS = new Set(['navigate', 'click', 'type', 'select', 'scroll', 'back', 'wait_for', 'tabs']);

export class Recorder {
  constructor({ task = '', startUrl = null } = {}) {
    this.recording = { version: 1, task, startUrl, recordedAt: new Date().toISOString(), steps: [] };
  }

  // Chamado pelo agente depois de uma ferramenta de página dar certo.
  // `target` é o {role, label} do ref, capturado ANTES da ação (depois os refs mudam).
  onTool(tool, input, { target = null, desc = null } = {}) {
    if (!PAGE_TOOLS.has(tool)) return;
    if (tool === 'tabs' && input.action === 'list') return;
    const step = { tool, input: { ...input } };
    if (input.ref) {
      delete step.input.ref;
      step.target = target;
    }
    if (tool === 'type' && isSensitiveField(desc)) {
      step.input.text = null;
      step.sensitive = true;
    }
    this.recording.steps.push(step);
  }

  toJSON() {
    return this.recording;
  }
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

// Acha o ref de um alvo no texto do snapshot: rótulo exato primeiro, depois
// rótulo normalizado (caixa/acentos), depois "contém". Papel tem de bater.
export function findRef(snapshotText, { role, label }) {
  const lines = [...snapshotText.matchAll(/^\[(e\d+)\] (\S+) ("(?:[^"\\]|\\.)*")/gm)].map((m) => ({ ref: m[1], role: m[2], label: JSON.parse(m[3]) }));
  const same = lines.filter((l) => l.role === role);
  return (
    same.find((l) => l.label === label) ||
    same.find((l) => norm(l.label) === norm(label)) ||
    (label && same.find((l) => l.label && (norm(l.label).includes(norm(label)) || norm(label).includes(norm(l.label)))))
  )?.ref || null;
}

const rebase = (url, from, to) => {
  if (!from || !to) return url;
  const a = new URL(from).origin;
  return url.startsWith(a) ? new URL(to).origin + url.slice(a.length) : url;
};

// "Modelo" que dirige o runAgent a partir de uma gravação.
export class ReplayModel {
  constructor(recording, { startUrl = null, asker = null } = {}) {
    this.recording = recording;
    this.startUrl = startUrl;
    this.asker = asker;
    this.i = 0;
    this.snapshot = '';
    this.n = 0;
  }

  async next({ messages }) {
    const last = messages[messages.length - 1];
    const blocks = Array.isArray(last.content) ? last.content : [];
    for (const b of blocks) {
      const text = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : '';
      if (text.includes('Elementos interativos:')) this.snapshot = text;
      if (b.is_error) return this.stop('blocked', `Repetição interrompida no passo ${this.i}: ${text}`);
    }
    if (this.i >= this.recording.steps.length) return this.stop('completed', `Repetição concluída: ${this.recording.steps.length} passo(s) de "${this.recording.task}".`);

    const step = this.recording.steps[this.i++];
    const input = { ...step.input };
    if (step.tool === 'navigate') input.url = rebase(input.url, this.recording.startUrl, this.startUrl);
    if (step.target) {
      const ref = findRef(this.snapshot, step.target);
      if (!ref) return this.stop('blocked', `Passo ${this.i}: não achei ${step.target.role} "${step.target.label}" na página (o site mudou?).`);
      input.ref = ref;
    }
    if (step.sensitive) {
      const value = this.asker ? await this.asker({ question: `Valor para o campo sensível "${step.target?.label}" (passo ${this.i})`, handoff: false }) : null;
      if (value === null || value === undefined) return this.stop('blocked', `Passo ${this.i}: o campo "${step.target?.label}" é sensível e não foi gravado; é preciso um humano para preenchê-lo.`);
      input.text = String(value);
    }
    return this.call(step.tool, input);
  }

  call(name, input) {
    return { content: [{ type: 'tool_use', id: `replay_${++this.n}`, name, input }], stop_reason: 'tool_use' };
  }

  stop(status, answer) {
    const ids = [...this.snapshot.matchAll(/\[(obs_\d+)\]/g)].map((m) => m[1]);
    return this.call('done', { status, answer, evidence: ids.length ? [ids[ids.length - 1]] : [] });
  }
}
