// Modelos que dirigem o loop. Interface única: next({system, tools, messages})
// -> { content, stop_reason }.
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeModel {
  constructor({ model = 'claude-opus-5-5', effort = 'medium', client = new Anthropic() } = {}) {
    this.model = model;
    this.effort = effort;
    this.client = client;
    this.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  }

  async next({ system, tools, messages }) {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      system,
      tools,
      messages, // a conversa vai inteira e sem edição: blocos de thinking incluídos
      thinking: { type: 'adaptive' },
      output_config: { effort: this.effort },
      cache_control: { type: 'ephemeral' },
      // Se um classificador recusar, o servidor tenta um modelo de fallback.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    for (const k of Object.keys(this.usage)) this.usage[k] += res.usage?.[k] || 0;
    return { content: res.content, stop_reason: res.stop_reason };
  }
}

// Dublê determinístico para testes e para a demo offline: um "piloto" escrito à
// mão que recebe o último tool_result e decide a próxima chamada. Não é IA; serve
// para exercitar o loop, o portão e o REA sem chave de API.
export class ScriptedModel {
  constructor(steps) {
    this.steps = steps; // array de (lastResultText, history) => [{name, input}] | {text}
    this.i = 0;
  }

  async next({ messages }) {
    const last = messages[messages.length - 1];
    const lastText = Array.isArray(last.content)
      ? last.content.map((b) => (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : '')).join('\n')
      : last.content;
    const step = this.steps[Math.min(this.i++, this.steps.length - 1)];
    const out = await step(lastText, messages);
    if (out.text) return { content: [{ type: 'text', text: out.text }], stop_reason: 'end_turn' };
    const calls = Array.isArray(out) ? out : [out];
    return {
      content: calls.map((c, k) => ({ type: 'tool_use', id: `toolu_${this.i}_${k}`, name: c.name, input: c.input })),
      stop_reason: 'tool_use',
    };
  }
}

// Acha o ref de um elemento no texto de um snapshot pelo rótulo.
export function refFor(snapshotText, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = snapshotText.match(new RegExp(`\\[(e\\d+)\\] \\w+ "[^"]*${esc}`, 'i'));
  if (!m) throw new Error(`elemento "${label}" não encontrado no snapshot`);
  return m[1];
}

export const lastEvidence = (text, kind = 'obs') => {
  const re = kind === 'ev' ? /ev_[0-9a-f]{16,}/g : /\[(obs_\d+)\]/g;
  const all = [...text.matchAll(re)];
  if (!all.length) return null;
  return kind === 'ev' ? all[all.length - 1][0] : all[all.length - 1][1];
};
