// Camada de ação: um Chromium controlado pelo Playwright, com a porta CDP
// aberta em loopback para que o REA observe a MESMA página (camada de percepção).
import net from 'node:net';
import { chromium } from 'playwright';

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Roda dentro da página: marca elementos interativos com data-rea-ref e devolve
// um retrato compacto, no espírito de "ler o arquivo antes de editar".
function snapshotInPage(maxText) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = (el) => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const raw =
      el.getAttribute('aria-label') ||
      (byFor && byFor.innerText) ||
      (el.closest('label') && el.closest('label').innerText) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      (el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type) ? el.value : '') ||
      el.innerText ||
      el.getAttribute('name') ||
      '';
    return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
  };
  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'select') return 'combobox';
    if (t === 'textarea') return 'textbox';
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (['submit', 'button', 'reset'].includes(ty)) return 'button';
      if (ty === 'checkbox' || ty === 'radio') return ty;
      return 'textbox';
    }
    return t;
  };
  document.querySelectorAll('[data-rea-ref]').forEach((el) => el.removeAttribute('data-rea-ref'));
  const sel = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[contenteditable=true]';
  const lines = [];
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el) || el.disabled) continue;
    const ref = `e${++n}`;
    el.setAttribute('data-rea-ref', ref);
    const role = roleOf(el);
    let extra = '';
    if (role === 'link') extra = ` -> ${el.getAttribute('href')}`;
    if (role === 'textbox') extra = ` type=${el.type || 'text'} value=${JSON.stringify(el.value || '')}`;
    if (role === 'combobox') extra = ` options=${JSON.stringify([...el.options].map((o) => o.text).slice(0, 10))}`;
    if (role === 'checkbox' || role === 'radio') extra = ` checked=${el.checked}`;
    lines.push(`[${ref}] ${role} ${JSON.stringify(label(el))}${extra}`);
  }
  const text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    url: location.href,
    title: document.title,
    interactive: lines,
    text: text.length > maxText ? text.slice(0, maxText) + `\n… [${text.length - maxText} caracteres omitidos; use find]` : text,
    fullText: text,
  };
}

function describeInPage(ref) {
  const el = document.querySelector(`[data-rea-ref="${ref}"]`);
  if (!el) return null;
  const form = el.form || el.closest('form');
  return {
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || '').toLowerCase(),
    name: el.getAttribute('name') || '',
    id: el.id || '',
    autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
    text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    href: el.getAttribute('href') ? new URL(el.getAttribute('href'), location.href).href : null,
    formAction: form ? new URL(form.getAttribute('action') || location.href, location.href).href : null,
    formMethod: form ? (form.getAttribute('method') || 'get').toLowerCase() : null,
    submits: Boolean(form) && (el.tagName === 'BUTTON' ? (el.getAttribute('type') || 'submit') === 'submit' : ['submit', 'image'].includes(el.type)),
  };
}

export class BrowserSession {
  static async launch({ headless = true } = {}) {
    const port = await freePort();
    const browser = await chromium.launch({
      headless,
      args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
    });
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();
    return new BrowserSession(browser, page, `http://127.0.0.1:${port}`);
  }

  constructor(browser, page, endpoint) {
    this.browser = browser;
    this.endpoint = endpoint; // usado pelo REA
    this.lastFullText = '';
    this.contacted = new Set(); // origens que a página atual contatou (só a origem, sem dados)
    this.attach(page);
  }

  attach(page) {
    this.page = page;
    this.contacted.clear();
    page.on('request', (req) => {
      if (page !== this.page) return;
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) this.contacted.clear();
      try {
        const u = new URL(req.url());
        if (u.protocol === 'http:' || u.protocol === 'https:') this.contacted.add(u.origin);
      } catch {
        /* URL não parseável (data:, blob:): não há origem para aprovar */
      }
    });
  }

  // Origens a aprovar no REA: a da página primeiro, depois as que ela chamou.
  observedOrigins(limit = 20) {
    const own = new URL(this.page.url()).origin;
    return [own, ...[...this.contacted].filter((o) => o !== own)].slice(0, limit);
  }

  url() {
    return this.page.url();
  }

  async settle() {
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {});
  }

  async goto(url) {
    const res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.settle();
    return { status: res ? res.status() : null, url: this.page.url() };
  }

  async snapshot({ maxText = 4000 } = {}) {
    const snap = await this.page.evaluate(snapshotInPage, maxText);
    this.lastFullText = snap.fullText;
    delete snap.fullText;
    return snap;
  }

  async describe(ref) {
    return this.page.evaluate(describeInPage, ref);
  }

  locator(ref) {
    if (!/^e\d+$/.test(ref)) throw new Error(`ref inválido: ${ref}`);
    return this.page.locator(`[data-rea-ref="${ref}"]`);
  }

  async click(ref) {
    await this.locator(ref).click({ timeout: 10_000 });
    await this.settle();
  }

  async type(ref, text, { submit = false } = {}) {
    const loc = this.locator(ref);
    await loc.fill(text, { timeout: 10_000 });
    if (submit) {
      await loc.press('Enter');
      await this.settle();
    }
  }

  async select(ref, value) {
    await this.locator(ref).selectOption({ label: value }, { timeout: 10_000 }).catch(() => this.locator(ref).selectOption(value));
    await this.settle();
  }

  async scroll(direction) {
    await this.page.mouse.wheel(0, direction === 'up' ? -800 : 800);
    await this.page.waitForTimeout(200);
  }

  async back() {
    await this.page.goBack({ timeout: 10_000 }).catch(() => null);
    await this.settle();
  }

  async screenshot() {
    return this.page.screenshot({ type: 'png' });
  }

  // ID do alvo CDP desta aba, para entregar ao REA.
  async targetId() {
    const cdp = await this.page.context().newCDPSession(this.page);
    try {
      const { targetInfo } = await cdp.send('Target.getTargetInfo');
      return targetInfo.targetId;
    } finally {
      await cdp.detach().catch(() => {});
    }
  }

  async close() {
    await this.browser.close().catch(() => {});
  }
}
