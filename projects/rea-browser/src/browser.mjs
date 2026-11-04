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

// req.frame() lança na navegação de uma aba recém-aberta (o frame ainda não
// existe); uma navegação sem frame só pode ser o frame principal dessa aba.
function isMainNavigation(req) {
  if (!req.isNavigationRequest()) return false;
  try {
    const frame = req.frame();
    return frame === frame.page().mainFrame();
  } catch {
    return true;
  }
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
    const session = new BrowserSession(browser, page, `http://127.0.0.1:${port}`);
    await context.route('**/*', (route, req) => session.routeNavigation(route, req));
    context.on('page', (p) => session.onNewPage(p));
    return session;
  }

  constructor(browser, page, endpoint) {
    this.browser = browser;
    this.endpoint = endpoint; // usado pelo REA
    this.lastFullText = '';
    this.contacted = new Set(); // origens que a página atual contatou (só a origem, sem dados)
    this.guard = () => true; // (url) => boolean; o agente liga isto à política
    this.blocked = []; // navegações barradas desde a última leitura
    this.dialogs = []; // diálogos JS desde a última leitura
    // Sem handler, o Playwright recusa todo confirm() em silêncio. Padrão aqui:
    // alert é aceito (só informa), o resto é recusado — e tudo fica registrado.
    this.dialogHandler = async (d) => d.type === 'alert';
    this.tabs = [];
    this.tabEvents = []; // abas abertas/fechadas desde a última leitura
    this.wire(page);
    this.activate(page);
  }

  // Abas novas (target=_blank, window.open) viram a aba ativa: é para lá que o
  // usuário olharia. A antiga continua acessível pela ferramenta tabs.
  onNewPage(page) {
    if (this.tabs.includes(page)) return;
    this.wire(page);
    this.activate(page);
    this.tabEvents.push({ kind: 'opened', index: this.tabs.indexOf(page) });
  }

  takeTabEvents() {
    return this.tabEvents.splice(0);
  }

  listTabs() {
    return this.tabs.map((p, i) => ({ index: i, url: p.url(), active: p === this.page }));
  }

  async tabTitles() {
    return Promise.all(this.listTabs().map(async (t) => ({ ...t, title: await this.tabs[t.index].title().catch(() => '') })));
  }

  async switchTab(index) {
    const page = this.tabs[index];
    if (!page) throw new Error(`aba ${index} não existe (há ${this.tabs.length})`);
    this.activate(page);
    await page.bringToFront();
  }

  async closeTab(index) {
    const page = this.tabs[index];
    if (!page) throw new Error(`aba ${index} não existe (há ${this.tabs.length})`);
    if (this.tabs.length === 1) throw new Error('não dá para fechar a única aba');
    await page.close();
  }

  setDialogHandler(fn) {
    this.dialogHandler = fn;
  }

  takeDialogs() {
    return this.dialogs.splice(0);
  }

  async onDialog(dialog) {
    const info = { type: dialog.type(), message: dialog.message().slice(0, 300) };
    let accepted = false;
    try {
      accepted = Boolean(await this.dialogHandler(info));
    } finally {
      // O clique que abriu o diálogo fica parado até ele ser resolvido.
      await (accepted ? dialog.accept() : dialog.dismiss()).catch(() => {});
      this.dialogs.push({ ...info, accepted });
    }
  }

  setNavigationGuard(fn) {
    this.guard = fn;
  }

  takeBlocked() {
    return this.blocked.splice(0);
  }

  // O escopo valia só para as ações que o agente pedia. Esta guarda vale para
  // qualquer navegação do frame principal, inclusive as que a página dispara
  // sozinha (location.href, form.submit) e os redirecionamentos.
  async routeNavigation(route, req) {
    if (!isMainNavigation(req)) return route.continue();
    if (!this.guard(req.url())) {
      this.blocked.push({ url: req.url(), via: 'navegação' });
      return route.abort('blockedbyclient');
    }
    if (req.method() !== 'GET') return route.continue();
    // Redirecionamentos não passam pelo route: busca sem seguir e decide aqui.
    let res;
    try {
      res = await route.fetch({ maxRedirects: 0 });
    } catch {
      return route.continue();
    }
    const location = res.status() >= 300 && res.status() < 400 && res.headers().location;
    if (location) {
      const next = new URL(location, req.url()).href;
      if (!this.guard(next)) {
        this.blocked.push({ url: next, via: `redirecionamento de ${req.url()}` });
        return route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><meta charset="utf-8"><title>Navegação bloqueada</title><h1>Navegação bloqueada</h1><p>Redirecionamento para ${next.replace(/[<>&"]/g, '')} fora do escopo.</p>`,
        });
      }
    }
    return route.fulfill({ response: res });
  }

  activate(page) {
    this.page = page;
    this.contacted.clear();
  }

  // Listeners uma vez por aba; os de estado só agem se a aba for a ativa.
  wire(page) {
    this.tabs.push(page);
    page.on('close', () => {
      this.tabs = this.tabs.filter((p) => p !== page);
      this.tabEvents.push({ kind: 'closed' });
      if (this.page === page && this.tabs.length) this.activate(this.tabs[this.tabs.length - 1]);
    });
    page.on('dialog', (d) => this.onDialog(d));
    // Segunda linha: se algo escapou da guarda (ex.: cadeia de redirecionamentos),
    // registra e volta.
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame() || this.guard(frame.url()) || frame.url() === 'about:blank') return;
      this.blocked.push({ url: frame.url(), via: 'pós-navegação (voltou)' });
      page.goBack({ timeout: 5_000 }).catch(() => {});
    });
    page.on('request', (req) => {
      if (page !== this.page) return;
      if (isMainNavigation(req)) this.contacted.clear();
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
    let res = null;
    try {
      res = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (e) {
      if (!/ERR_BLOCKED_BY_CLIENT/.test(e.message)) throw e; // a guarda barrou: vira aviso
    }
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
    const ctx = this.page.context();
    const opensTab = await this.locator(ref).evaluate((el) => (el.closest('a,form')?.getAttribute('target') || '') === '_blank').catch(() => false);
    const newPage = opensTab ? ctx.waitForEvent('page', { timeout: 5_000 }).catch(() => null) : null;
    await this.locator(ref).click({ timeout: 10_000 });
    const opened = await newPage;
    if (opened) await opened.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
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
