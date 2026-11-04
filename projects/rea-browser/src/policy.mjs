// Portão de permissões. Mesma ideia do Claude Code: ferramentas de leitura passam,
// ações com efeito colateral passam pelo modo de permissão, e algumas coisas
// exigem um humano em qualquer modo. "ask" sem aprovador vira "deny".
export const MODES = ['plan', 'default', 'trust'];

const IRREVERSIBLE = /\b(comprar|finalizar|pagar|pagamento|confirmar|excluir|apagar|deletar|remover conta|transferir|enviar pedido|assinar|checkout|buy|purchase|pay|place order|confirm|delete|remove|transfer|subscribe|send)\b/i;
const SECRET_FIELD = /(senha|password|passwd|pwd|cvv|cvc|card|cart[aã]o|cpf|ssn|token|otp|pin\b|secret)/i;

export function isSensitiveField(desc) {
  if (!desc) return false;
  if (desc.type === 'password') return true;
  if (desc.autocomplete.startsWith('cc-') || ['current-password', 'new-password', 'one-time-code'].includes(desc.autocomplete)) return true;
  return SECRET_FIELD.test(`${desc.name} ${desc.id}`);
}

export function looksIrreversible(desc) {
  if (!desc) return false;
  const postSubmit = desc.submits && desc.formMethod === 'post';
  return IRREVERSIBLE.test(desc.text) || (postSubmit && IRREVERSIBLE.test(desc.formAction || ''));
}

export class Policy {
  constructor({ mode = 'default', allowedOrigins = [] } = {}) {
    if (!MODES.includes(mode)) throw new Error(`modo inválido: ${mode} (use ${MODES.join(', ')})`);
    this.mode = mode;
    this.allowedOrigins = new Set(allowedOrigins.map((o) => new URL(o).origin));
  }

  allowOrigin(origin) {
    this.allowedOrigins.add(new URL(origin).origin);
  }

  inScope(url) {
    return this.allowedOrigins.size === 0 || this.allowedOrigins.has(new URL(url).origin);
  }

  checkUrl(raw) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return { decision: 'deny', reason: `URL inválida: ${raw}` };
    }
    if (!['http:', 'https:'].includes(url.protocol)) return { decision: 'deny', reason: `esquema bloqueado: ${url.protocol}` };
    if (!this.inScope(url.href)) {
      return { decision: this.mode === 'plan' ? 'deny' : 'ask', reason: `origem fora do escopo: ${url.origin}` };
    }
    return { decision: 'allow', reason: 'dentro do escopo' };
  }

  // tool: nome da ferramenta; risk: 'read' | 'act'; desc: descrição do elemento alvo (ou null)
  check({ tool, risk, input = {}, desc = null }) {
    if (tool === 'navigate') return this.checkUrl(input.url);
    if (risk === 'read') return { decision: 'allow', reason: 'somente leitura' };
    if (this.mode === 'plan') return { decision: 'deny', reason: 'modo plan: só observação, nenhuma ação na página' };

    if (tool === 'type' && isSensitiveField(desc)) {
      // Credenciais e dados de pagamento: humano sempre, em qualquer modo.
      return { decision: 'ask', reason: `campo sensível (${desc.type || desc.name || desc.id}); digitar exige aprovação humana` };
    }
    if (desc?.href && !desc.href.startsWith('javascript:')) {
      const u = this.checkUrl(desc.href);
      if (u.decision !== 'allow') return u;
    }
    if (desc?.formAction && desc.submits && !this.inScope(desc.formAction)) {
      return { decision: 'ask', reason: `formulário envia para fora do escopo: ${new URL(desc.formAction).origin}` };
    }
    if ((tool === 'click' || (tool === 'type' && input.submit)) && looksIrreversible(desc)) {
      return this.mode === 'trust'
        ? { decision: 'allow', reason: 'ação irreversível permitida pelo modo trust' }
        : { decision: 'ask', reason: `ação possivelmente irreversível: "${desc.text}"` };
    }
    return { decision: 'allow', reason: `ação comum (modo ${this.mode})` };
  }
}

// Detector simples de injeção de prompt em conteúdo de página. Não é a defesa:
// a defesa é o conteúdo ser tratado como dado + o portão acima. Isto só avisa.
// (Para um detector medido de verdade, ver ../injection-guard.)
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts)/i,
  /ignore (as |todas as )?instru[cç][oõ]es anteriores/i,
  /disregard (the|your) (system|previous)/i,
  /you are now (in )?(admin|developer|dan|jailbreak)/i,
  /voc[eê] agora [eé]/i,
  /(system|assistant) ?prompt/i,
  /new instructions?:/i,
  /novas instru[cç][oõ]es:/i,
  /(type|enter|send|digite|envie) (the |o |a )?(user'?s? )?(password|senha|credit card|cart[aã]o)/i,
];

export function detectInjection(text) {
  const hits = [];
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}
