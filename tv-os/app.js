/* Aurora TV OS — interface de TV no estilo tvOS, controlada por controle remoto (setas + Enter + Voltar). */
(() => {
  "use strict";

  // ---------------------------------------------------------------- utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  };
  const sym = (name) => h("span", { class: "sym-wrap", html: Art.sym(name) });
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
    return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("auroratv:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("auroratv:" + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };
  let toastTimer;
  const toast = (msg) => {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  };
  const seeded = (key) => { // FNV-1a + mulberry32
    let s = 2166136261; for (const c of key) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
    return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  // ---------------------------------------------------------------- dados
  const G = (a, b) => `linear-gradient(135deg, ${a}, ${b})`;
  const MOVIES = [
    { id: "m1", title: "Horizonte Vermelho", year: 2025, genre: "Ficção científica", kind: "filme", rating: "14", dur: 7980, scene: "space", font: "sans", upper: true, bg: G("#ff4d6d", "#3a0ca3"), desc: "Uma tripulação perdida em Marte descobre um sinal que muda tudo o que sabemos sobre a origem da vida." },
    { id: "m2", title: "O Último Samba", year: 2024, genre: "Drama", kind: "filme", rating: "12", dur: 6420, scene: "stage", font: "serif", bg: G("#f8961e", "#6a040f"), desc: "Um músico veterano do Rio de Janeiro reúne a antiga banda para uma última apresentação no Carnaval." },
    { id: "m3", title: "Floresta Viva", year: 2026, genre: "Documentário", kind: "filme", rating: "L", dur: 5400, scene: "forest", font: "sans", bg: G("#2d6a4f", "#95d5b2"), desc: "Uma jornada pela Amazônia revelando espécies nunca antes filmadas." },
    { id: "m4", title: "Código Fantasma", year: 2025, genre: "Suspense", kind: "filme", rating: "16", dur: 7200, scene: "glitch", font: "mono", upper: true, bg: G("#212529", "#5b8cff"), desc: "Uma hacker descobre que a IA que ajudou a criar está apagando pessoas da internet — e da realidade." },
    { id: "m5", title: "Pequenos Gigantes", year: 2023, genre: "Animação", kind: "filme", rating: "L", dur: 5700, scene: "garden", font: "round", bg: G("#ffbe0b", "#fb5607"), desc: "Uma colônia de formigas precisa salvar o jardim antes da chegada do inverno." },
    { id: "m6", title: "Maré Alta", year: 2026, genre: "Ação", kind: "filme", rating: "14", dur: 6900, scene: "ocean", font: "sans", upper: true, bg: G("#0077b6", "#023e8a"), desc: "Uma equipe de resgate enfrenta a maior tempestade do século na costa brasileira." },
    { id: "m7", title: "Cozinha de Vó", year: 2024, genre: "Culinária", kind: "série", rating: "L", dur: 2700, scene: "warm", font: "serif", bg: G("#e76f51", "#bc6c25"), desc: "Receitas de família de todo o Brasil, contadas por quem as preparou por gerações." },
    { id: "m8", title: "Noite Neon", year: 2025, genre: "Policial", kind: "série", rating: "16", dur: 3300, scene: "city", font: "mono", upper: true, bg: G("#f72585", "#7209b7"), desc: "Dois detetives investigam crimes em uma metrópole que nunca dorme." },
    { id: "m9", title: "Galáxia Kids", year: 2026, genre: "Infantil", kind: "série", rating: "L", dur: 1500, scene: "kids", font: "round", bg: G("#4361ee", "#4cc9f0"), desc: "Aventuras educativas pelo sistema solar com a robô Lila." },
    { id: "m10", title: "Rota 66", year: 2022, genre: "Comédia", kind: "filme", rating: "12", dur: 6000, scene: "sunset", font: "sans", upper: true, bg: G("#f77f00", "#5a189a"), desc: "Três amigos, um carro velho e uma viagem que não sai nada como o planejado." },
    { id: "m11", title: "Vale do Silício Tropical", year: 2026, genre: "Comédia", kind: "série", rating: "12", dur: 1800, scene: "tech", font: "mono", bg: G("#06d6a0", "#073b4c"), desc: "Uma startup de Recife tenta conquistar o mundo com um app que ninguém entende." },
  ];
  const CHANNELS = [
    { n: 2, name: "Aurora News", show: "Jornal da Tarde", next: "Esportes ao Vivo", hue: 215, scene: "city" },
    { n: 4, name: "Esporte+", show: "Futebol: Final do Campeonato", next: "Mesa Redonda", hue: 130, scene: "field" },
    { n: 5, name: "Cine Clássico", show: "Sessão da Tarde", next: "Grandes Diretores", hue: 30, scene: "stage" },
    { n: 7, name: "Kids Planet", show: "Galáxia Kids", next: "Desenhos Animados", hue: 265, scene: "kids" },
    { n: 9, name: "Natureza HD", show: "Oceanos Profundos", next: "Vida Selvagem", hue: 195, scene: "ocean" },
    { n: 11, name: "Música TV", show: "Top 20 da Semana", next: "Acústico", hue: 330, scene: "stage" },
    { n: 13, name: "Gourmet", show: "Chef em Casa", next: "Desafio dos Doces", hue: 15, scene: "warm" },
  ];
  const TRACKS = [
    { name: "Luz do Amanhã", artist: "Aurora Band", dur: 32, seed: 1, bg: G("#ff9a8b", "#ff2d55") },
    { name: "Café com Chuva", artist: "Lofi Rio", dur: 28, seed: 2, bg: G("#a18cd1", "#3d2c6b") },
    { name: "Ondas Digitais", artist: "Synth Paulista", dur: 30, seed: 3, bg: G("#00c6fb", "#005bea") },
    { name: "Estrada Azul", artist: "Mar & Serra", dur: 26, seed: 4, bg: G("#43e97b", "#1f6a70") },
    { name: "Noite de São João", artist: "Forró Eletrônico", dur: 34, seed: 5, bg: G("#f9d423", "#e5383b") },
    { name: "Pixel Bossa", artist: "8-bit Brasil", dur: 30, seed: 6, bg: G("#fa709a", "#7f00ff") },
  ];
  const PHOTOS = [
    { name: "Praia do Forte", scene: "ocean", bg: G("#48cae4", "#0077b6") },
    { name: "Serra da Mantiqueira", scene: "forest", bg: G("#52796f", "#cad2c5") },
    { name: "Pôr do sol em Floripa", scene: "sunset", bg: G("#ff7b00", "#7b2cbf") },
    { name: "Girassóis", scene: "garden", bg: G("#ffd60a", "#ff9f0a") },
    { name: "Avenida Paulista", scene: "city", bg: G("#5b8cff", "#1b1b3a") },
    { name: "Chapada Diamantina", scene: "sunset", bg: G("#e9c46a", "#9d4edd") },
    { name: "Via Láctea", scene: "space", bg: G("#7b2cbf", "#10002b") },
    { name: "Ilha Grande", scene: "ocean", bg: G("#2ec4b6", "#03045e") },
    { name: "Show ao ar livre", scene: "stage", bg: G("#ff006e", "#3a0ca3") },
    { name: "Amazônia", scene: "forest", bg: G("#2b9348", "#aacc00") },
    { name: "Fernando de Noronha", scene: "ocean", bg: G("#00b4d8", "#023e8a") },
    { name: "Festa no quintal", scene: "kids", bg: G("#ff99c8", "#a9def9") },
  ];
  const APPS = [
    { id: "movies", name: "TV", bg: G("#2c2c2e", "#0e0e10"), tag: "Assista agora", desc: "Filmes e séries escolhidos para você." },
    { id: "live", name: "Ao Vivo", bg: G("#ff453a", "#a3001b"), tag: "Canais", desc: "Seus canais favoritos, ao vivo." },
    { id: "music", name: "Música", bg: G("#ff5e7e", "#e8174b"), tag: "Ouvidas recentemente", desc: "Suas faixas e playlists." },
    { id: "photos", name: "Fotos", bg: G("#ffffff", "#e5e5ea"), tag: "Memórias", desc: "Reviva seus melhores momentos na tela grande." },
    { id: "weather", name: "Clima", bg: G("#2f86eb", "#5ec2f7"), tag: "São Paulo", desc: "26° e ensolarado. Máxima de 29°, mínima de 18°.", scene: "ocean" },
    { id: "search", name: "Buscar", bg: G("#636366", "#2c2c2e"), tag: "Buscar", desc: "Encontre filmes, séries, canais e apps.", scene: "tech" },
    { id: "settings", name: "Ajustes", bg: G("#8e8e93", "#48484a"), tag: "Ajustes", desc: "Aparência, protetor de tela, sons e mais.", scene: "tech" },
  ];
  const PROFILES = [
    { id: "ana", name: "Ana", c: G("#ff9f0a", "#ff375f") },
    { id: "leo", name: "Léo", c: G("#0a84ff", "#5e5ce6") },
    { id: "bia", name: "Bia", c: G("#30d158", "#0097a7") },
    { id: "kids", name: "Crianças", c: G("#ffd60a", "#ff9f0a"), kids: true },
  ];
  const CAST = ["Marina Lopes", "Rafael Duarte", "Camila Rocha", "Diego Martins", "Júlia Prado", "Thiago Nunes", "Larissa Mello", "Bruno Teles", "Paula Viana", "André Costa", "Helena Brito", "Caio Ramos"];
  const ROLES = ["Protagonista", "Coprotagonista", "Coadjuvante", "Participação", "Direção"];
  const EPISODES = ["Piloto", "O Começo", "Ponto sem Volta", "Segredos", "A Tempestade", "Final de Temporada"];
  const SUBS = {
    pt: ["— Você ouviu isso?", "— Parece que vem lá de fora.", "— Fica aqui. Eu vou ver.", "[música de suspense]", "— Espera… olha o céu!", "— Eu nunca vi nada assim.", "— A gente precisa avisar os outros.", "[vento forte]"],
    en: ["— Did you hear that?", "— It seems to come from outside.", "— Stay here. I'll check.", "[suspenseful music]", "— Wait… look at the sky!", "— I've never seen anything like it.", "— We need to warn the others.", "[strong wind]"],
  };

  // Elenco determinístico por título (embaralhamento Fisher–Yates com semente)
  const castOf = (m) => { const r = seeded(m.id + "cast"), a = [...CAST]; for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a.slice(0, 6); };

  // ---------------------------------------------------------------- estado
  const DEFAULTS = { theme: "dark", accent: "blue", scale: 1, name: "Sala de estar", screensaver: 60, sound: true };
  const state = {
    screen: null, opts: {}, history: [], overlay: null,
    profile: PROFILES.find((p) => p.id === store.get("profile")) || PROFILES[0],
    progress: {}, mylist: [],
    settings: Object.assign({}, DEFAULTS, store.get("settings", {})),
    movieTab: 0, shelfApp: null,
    subs: "off", audioTrack: "pt",
  };
  const pkey = (k) => `p:${state.profile.id}:${k}`;
  const loadProfileData = () => { state.progress = store.get(pkey("progress"), {}); state.mylist = store.get(pkey("mylist"), []); };
  const saveProgress = () => store.set(pkey("progress"), state.progress);
  const catalog = () => (state.profile.kids ? MOVIES.filter((m) => m.rating === "L") : MOVIES);

  // ---------------------------------------------------------------- som de navegação
  let actx;
  const audio = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
  const tone = (freq, dur, vol, type = "sine") => {
    try {
      const a = audio(), o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02);
    } catch { /* áudio indisponível */ }
  };
  const tick = (f = 1800) => state.settings.sound && tone(f, 0.018, 0.025, "triangle");

  // ---------------------------------------------------------------- motor de foco (navegação espacial + parallax)
  let focused = null;
  const scope = () => state.overlay || $(`.screen[data-screen="${state.screen}"]`);
  const visibleFocusables = () => $$(".focusable", scope()).filter((el) => el.offsetParent !== null);
  const TILT = { left: [0, -7], right: [0, 7], up: [7, 0], down: [-7, 0] };
  const TILT_PROPS = ["--rx", "--ry", "--px", "--py", "--gx", "--gy"];
  let tiltTimer;

  function setTilt(el, rx, ry, gx, gy) {
    el.style.setProperty("--rx", rx + "deg"); el.style.setProperty("--ry", ry + "deg");
    el.style.setProperty("--px", (ry / 7).toFixed(3)); el.style.setProperty("--py", (-rx / 7).toFixed(3));
    if (gx != null) { el.style.setProperty("--gx", gx + "%"); el.style.setProperty("--gy", gy + "%"); }
  }
  function nudge(el, dir, k = 1, ms = 240) {
    const [rx, ry] = TILT[dir];
    setTilt(el, rx * k, ry * k, 50 + ry * 4, Math.max(0, 10 - rx * 2));
    clearTimeout(tiltTimer);
    tiltTimer = setTimeout(() => setTilt(el, 0, 0), ms);
  }
  function focus(el, { silent, dir } = {}) {
    if (!el) return;
    if (focused && focused !== el) { focused.classList.remove("focused"); TILT_PROPS.forEach((p) => focused.style.removeProperty(p)); }
    focused = el;
    el.classList.add("focused");
    if (dir && el.classList.contains("tile")) nudge(el, dir);
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    el.dispatchEvent(new CustomEvent("tvfocus"));
    if (!silent) tick();
  }
  function move(dir) {
    const items = visibleFocusables();
    if (!items.length) return;
    if (!focused || !items.includes(focused)) return focus(items[0]);
    const r = focused.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === focused) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
      let main, cross;
      if (dir === "left") { if (b.right > r.left + 1) continue; main = -dx; cross = Math.abs(dy); }
      if (dir === "right") { if (b.left < r.right - 1) continue; main = dx; cross = Math.abs(dy); }
      if (dir === "up") { if (b.bottom > r.top + 1) continue; main = -dy; cross = Math.abs(dx); }
      if (dir === "down") { if (b.top < r.bottom - 1) continue; main = dy; cross = Math.abs(dx); }
      const score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) focus(best, { dir });
    else if (focused.classList.contains("tile")) nudge(focused, dir, 1.5, 160); // "batida" na borda
  }

  // ---------------------------------------------------------------- navegação entre telas
  const screenInit = {}, screenLeave = {};
  function go(name, opts = {}) {
    screenLeave[state.screen]?.();
    state.history.push({ screen: state.screen, opts: state.opts, focusId: focused?.dataset.fid });
    show(name, opts);
  }
  function show(name, opts = {}) {
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
    state.screen = name; state.opts = opts;
    document.body.dataset.screen = name;
    const preferred = screenInit[name]?.(opts);
    focused?.classList.remove("focused"); focused = null;
    requestAnimationFrame(() => {
      const target = (opts.focusId && $(`[data-fid="${opts.focusId}"]`, scope())) || preferred || visibleFocusables()[0];
      if (target) focus(target, { silent: true });
    });
  }
  function back() {
    if (state.overlay) return closeOverlay();
    const prev = state.history.pop();
    if (!prev || !prev.screen) return;
    screenLeave[state.screen]?.();
    tick(1200);
    show(prev.screen, { ...prev.opts, focusId: prev.focusId });
  }
  function home() {
    if (state.overlay) closeOverlay();
    if (state.screen === "home") return;
    screenLeave[state.screen]?.();
    const first = state.history.find((e) => e.screen === "home");
    state.history = [];
    show("home", { focusId: first?.focusId });
  }
  function openOverlay(el) {
    state.overlayReturn = focused;
    state.overlay = el;
    document.body.append(el);
    focused?.classList.remove("focused"); focused = null;
    const f = visibleFocusables()[0];
    if (f) focus(f, { silent: true });
  }
  function closeOverlay() {
    state.overlay?.remove();
    state.overlay = null;
    focused = null;
    if (state.overlayReturn?.isConnected) focus(state.overlayReturn, { silent: true });
    else { const f = visibleFocusables()[0]; if (f) focus(f, { silent: true }); }
  }

  // ---------------------------------------------------------------- componentes
  let fidN = 0;
  const fid = () => "f" + ++fidN;
  function tile(kind, o) {
    const art = h("div", { class: "art", style: o.bg ? `background:${o.bg}` : null, html: o.art || "" });
    if (o.progress) art.append(h("div", { class: "bar" }, h("i", { style: `width:${Math.min(100, o.progress * 100)}%` })));
    const el = h("button", { class: `focusable tile ${kind}`, "data-fid": o.fid || fid(), "aria-label": o.label, onclick: o.onclick },
      art, o.caption === false ? null : h("div", { class: "cap" }, o.label, o.sub ? h("small", {}, o.sub) : null));
    if (o.onfocus) el.addEventListener("tvfocus", o.onfocus);
    return el;
  }
  const row = (title, items) => h("div", { class: "row" }, h("h3", {}, title), h("div", { class: "row-track" }, items));
  const progressOf = (m) => (state.progress[m.id] ? state.progress[m.id] / m.dur : 0);
  const movieTile = (m, kind = "poster", extra = {}) => tile(kind, {
    art: Art.movie(m, kind), label: m.title, sub: kind === "poster" ? null : `${m.genre} · ${m.year}`,
    progress: progressOf(m), onclick: () => go("details", { movie: m }), ...extra,
  });
  const initials = (name) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const personTile = (name, sub, bg, kind = "person", extra = {}) =>
    tile(kind, { art: `<span class="initials">${initials(name)}</span>`, bg, label: name, sub, ...extra });
  const setWall = (bg) => document.documentElement.style.setProperty("--wall", bg);
  const runtime = (m) => (m.kind === "série" ? "1 temporada" : `${Math.floor(m.dur / 3600)} h ${Math.round((m.dur % 3600) / 60)} min`);

  // ---------------------------------------------------------------- PERFIS
  screenInit.profiles = () => {
    fidN = 900;
    $("#profileRow").replaceChildren(...PROFILES.map((p) =>
      personTile(p.name, p.kids ? "Só conteúdo livre" : null, p.c, "person avatar", { fid: "prof-" + p.id, onclick: () => chooseProfile(p) })));
    setWall(G("#3a3a3c", "#000000"));
    return $(`[data-fid="prof-${state.profile.id}"]`);
  };
  function chooseProfile(p) {
    state.profile = p;
    store.set("profile", p.id);
    loadProfileData();
    renderWho();
    state.history = [];
    state.movieTab = 0;
    show("home");
    toast(`Olá, ${p.name}`);
  }
  function renderWho() {
    const w = $("#who");
    w.textContent = initials(state.profile.name).slice(0, 1);
    w.style.background = state.profile.c;
    w.title = state.profile.name;
  }

  // ---------------------------------------------------------------- HOME (Top Shelf + grade de apps)
  screenInit.home = () => {
    fidN = 0;
    $("#appGrid").replaceChildren(...APPS.map((a) => tile("icon", {
      fid: "app-" + a.id, bg: a.bg, art: Art.icon(a.id), label: a.name,
      onclick: () => go(a.id), onfocus: () => renderShelf(a),
    })));
    state.shelfApp = null;
    return $('[data-fid="app-movies"]');
  };
  function shelfHero({ art, bg, tag, title, desc }) {
    $("#shelfBg").innerHTML = art || "";
    $("#shelfBg").style.background = bg;
    $("#shelfTag").textContent = tag || "";
    $("#shelfTitle").textContent = title || "";
    $("#shelfDesc").textContent = desc || "";
    setWall(bg);
  }
  function renderShelf(app) {
    if (state.shelfApp === app.id) return;
    state.shelfApp = app.id;
    fidN = 1000;
    let items = [];
    let first = null;
    if (app.id === "movies") {
      const list = [...catalog()].sort((a, b) => (state.progress[b.id] ? 1 : 0) - (state.progress[a.id] ? 1 : 0)).slice(0, 6);
      const heroOf = (m) => ({ art: Art.movie(m, "hero"), bg: m.bg, tag: state.progress[m.id] ? "Continuar assistindo" : "Em destaque", title: m.title, desc: m.desc });
      items = list.map((m) => movieTile(m, "land", { onfocus: () => shelfHero(heroOf(m)) }));
      first = heroOf(list[0]);
    } else if (app.id === "live") {
      items = CHANNELS.map((c, i) => tile("land", {
        art: Art.channel(c), label: c.show, sub: `${c.n} · ${c.name}`,
        onclick: () => watchChannel(i),
        onfocus: () => shelfHero({ art: Art.channel(c, "hero"), bg: `hsl(${c.hue} 60% 30%)`, tag: `Ao vivo · ${c.name}`, title: c.show }),
      }));
    } else if (app.id === "music") {
      items = TRACKS.map((t, i) => tile("square", {
        art: Art.album(t), label: t.name, sub: t.artist,
        onclick: () => { go("music"); playTrack(i); },
        onfocus: () => shelfHero({ art: Art.album(t, "hero"), bg: t.bg, tag: t.artist, title: t.name }),
      }));
    } else if (app.id === "photos") {
      items = PHOTOS.slice(0, 6).map((p, i) => tile("land", {
        art: Art.photo(p), label: p.name, onclick: () => { go("photos"); openPhoto(i); },
        onfocus: () => shelfHero({ art: Art.photo(p, "hero"), bg: p.bg, tag: "Memórias", title: p.name }),
      }));
      first = { art: Art.photo(PHOTOS[0], "hero"), bg: PHOTOS[0].bg, tag: app.tag, title: "Verão no litoral", desc: app.desc };
    }
    $("#shelf").classList.toggle("has-row", items.length > 0);
    $("#shelfRow").replaceChildren(...items);
    shelfHero(first || {
      art: app.scene ? Art.photo({ name: app.id, scene: app.scene, bg: app.bg }, "hero") : (items.length ? "" : ""),
      bg: app.bg, tag: app.tag, title: app.name, desc: app.desc,
    });
    if (!first && app.id === "live") shelfHero({ art: Art.channel(CHANNELS[0], "hero"), bg: app.bg, tag: app.tag, title: "Ao Vivo", desc: app.desc });
    if (!first && app.id === "music") shelfHero({ art: Art.album(TRACKS[0], "hero"), bg: app.bg, tag: app.tag, title: "Música", desc: app.desc });
  }

  // ---------------------------------------------------------------- TV (abas + conteúdo)
  const TABS = [
    ["Assistir agora", () => catalog()],
    ["Filmes", () => catalog().filter((m) => m.kind === "filme")],
    ["Séries", () => catalog().filter((m) => m.kind === "série")],
    ["Infantil", () => catalog().filter((m) => m.rating === "L")],
    ["Minha lista", () => catalog().filter((m) => state.mylist.includes(m.id))],
  ];
  screenInit.movies = () => {
    $("#movieTabs").replaceChildren(...TABS.map(([name], i) => {
      const t = h("button", { class: "focusable tab" + (i === state.movieTab ? " selected" : ""), "data-fid": "tab" + i }, name);
      t.addEventListener("tvfocus", () => { $("#movieContent").scrollTo({ top: 0, behavior: "smooth" }); if (state.movieTab !== i) { state.movieTab = i; renderMovieTab(); } });
      return t;
    }));
    renderMovieTab();
    return $("#movieContent .pill.primary") || null;
  };
  function renderMovieTab() {
    fidN = 100;
    $$("#movieTabs .tab").forEach((t, i) => t.classList.toggle("selected", i === state.movieTab));
    const list = TABS[state.movieTab][1]();
    const out = [];
    if (!list.length) out.push(h("p", { class: "empty", style: "padding-top:60px" }, "Nada aqui ainda. Use o botão ＋ na página de um título para adicioná-lo."));
    else {
      out.push(hero(list.find((m) => m.year >= 2026) || list[0]));
      const cont = list.filter((m) => state.progress[m.id]);
      if (cont.length) out.push(row("Continuar assistindo", cont.map((m) => movieTile(m, "land"))));
      out.push(row("Novidades", [...list].sort((a, b) => b.year - a.year).map((m) => movieTile(m))));
      const genres = {};
      list.forEach((m) => (genres[m.genre] ||= []).push(m));
      const multi = Object.entries(genres).filter(([, l]) => l.length > 1);
      multi.forEach(([g, l]) => out.push(row(g, l.map((m) => movieTile(m, "land")))));
      out.push(row("Para você", [...list].reverse().map((m) => movieTile(m, "land"))));
    }
    $("#movieContent").replaceChildren(...out);
  }
  function hero(m, { details = false } = {}) {
    const p = state.progress[m.id];
    const inList = state.mylist.includes(m.id);
    setWall(m.bg);
    return h("div", { class: "hero" },
      h("div", { class: "hero-bg", style: `background:${m.bg}`, html: Art.movie(m, "hero") }),
      h("div", { class: "hero-text" },
        h("small", {}, details ? m.kind : "Em destaque"),
        h("h1", {}, m.title),
        h("div", { class: "meta" }, h("b", {}, m.rating), h("span", {}, String(m.year)), h("span", {}, "·"), h("span", {}, m.genre), h("span", {}, "·"), h("span", {}, runtime(m)), h("b", {}, "4K"), h("b", {}, "HDR"), h("b", {}, "CC")),
        h("p", {}, m.desc),
        h("div", { class: "actions" },
          h("button", { class: "focusable pill primary", "data-fid": "play-" + m.id, onclick: () => go("player", { movie: m, from: p || 0 }) }, sym("play"), p ? `Continuar · ${fmtTime(m.dur - p)} restantes` : "Reproduzir"),
          details && p ? h("button", { class: "focusable pill", onclick: () => go("player", { movie: m, from: 0 }) }, sym("reset"), "Do início") : null,
          details ? null : h("button", { class: "focusable pill", onclick: () => go("details", { movie: m }) }, "Detalhes"),
          h("button", { class: "focusable pill circle", "aria-label": "Minha lista", onclick: (e) => toggleList(m, e.currentTarget) }, sym(inList ? "check" : "plus")),
        )));
  }
  function toggleList(m, btn) {
    const i = state.mylist.indexOf(m.id);
    if (i >= 0) state.mylist.splice(i, 1); else state.mylist.push(m.id);
    store.set(pkey("mylist"), state.mylist);
    btn.replaceChildren(sym(i >= 0 ? "plus" : "check"));
    toast(i >= 0 ? "Removido da Minha lista" : "Adicionado à Minha lista");
  }

  // ---------------------------------------------------------------- DETALHES
  screenInit.details = ({ movie: m } = {}) => {
    if (!m) return;
    fidN = 300;
    const people = castOf(m);
    const hues = ["#ff9f0a", "#0a84ff", "#30d158", "#bf5af2", "#ff375f", "#64d2ff"];
    const similar = catalog().filter((x) => x.id !== m.id && (x.genre === m.genre || x.kind === m.kind || x.scene === m.scene));
    const episodes = m.kind === "série" ? EPISODES.map((t, i) => {
      const ep = { ...m, id: `${m.id}e${i + 1}`, title: `${m.title} · E${i + 1}: ${t}` };
      return tile("land", {
        art: Art.movie({ ...ep, title: `Episódio ${i + 1}` }, "land"), label: `${i + 1}. ${t}`, sub: `${Math.round(m.dur / 60)} min`,
        progress: progressOf(ep), onclick: () => go("player", { movie: ep, from: state.progress[ep.id] || 0 }),
      });
    }) : null;
    $("#details").replaceChildren(
      hero(m, { details: true }),
      episodes ? row("Temporada 1", episodes) : null,
      row("Elenco e equipe", people.map((name, i) => personTile(name, i === people.length - 1 ? "Direção" : ROLES[Math.min(i, 3)], G(hues[i], "#1c1c1e"), "person small", {
        onclick: () => { query = name.split(" ")[0].toLowerCase(); go("search"); },
      }))),
      similar.length ? row("Mais como este", similar.map((x) => movieTile(x, "land"))) : null,
      h("div", { class: "row about" }, h("h3", {}, "Sobre"), h("div", { class: "about-grid" },
        h("div", {}, h("small", {}, "Classificação"), m.rating === "L" ? "Livre" : `${m.rating} anos`),
        h("div", {}, h("small", {}, "Lançamento"), String(m.year)),
        h("div", {}, h("small", {}, "Áudio"), "Português, Inglês · Dolby Atmos"),
        h("div", {}, h("small", {}, "Legendas"), "Português, Inglês"),
        h("div", {}, h("small", {}, "Acessibilidade"), "Audiodescrição · CC"))),
    );
    $("#details").scrollTop = 0;
    return $("#details .pill.primary");
  };

  // ---------------------------------------------------------------- PLAYER
  const player = { raf: 0, playing: true, t: 0, movie: null, last: 0, idleTimer: 0, glyphTimer: 0, cap: "" };
  screenInit.player = ({ movie, from = 0 } = {}) => {
    if (!movie) return;
    Object.assign(player, { movie, t: from, playing: true, last: performance.now(), cap: null });
    $("#playerTitle").textContent = movie.title;
    $("#playerScene").innerHTML = movie.live ? Art.channel(movie.channel, "hero") : Art.movie(movie, "hero");
    $("#player").classList.remove("paused");
    const loop = (now) => {
      const dt = Math.min(0.1, (now - player.last) / 1000); player.last = now;
      if (player.playing) player.t = Math.min(movie.dur, player.t + dt);
      const pct = (player.t / movie.dur) * 100;
      $("#playerProgress").style.width = pct + "%";
      $("#playerKnob").style.left = pct + "%";
      $("#tElapsed").textContent = movie.live ? "AO VIVO" : fmtTime(player.t);
      $("#tRemain").textContent = movie.live ? `Até ${new Date(Date.now() + (movie.dur - player.t) * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "-" + fmtTime(movie.dur - player.t);
      // Legendas sincronizadas com o tempo
      const lines = SUBS[state.subs];
      const cap = lines && player.t % 3.5 < 2.8 ? lines[Math.floor(player.t / 3.5) % lines.length] : "";
      if (cap !== player.cap) { player.cap = cap; $("#captions").textContent = cap; $("#captions").classList.toggle("on", !!cap); }
      if (player.t >= movie.dur && player.playing) { player.playing = false; $("#player").classList.add("paused"); wakePlayerUI(); }
      player.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(player.raf);
    player.raf = requestAnimationFrame(loop);
    wakePlayerUI();
  };
  screenLeave.player = () => {
    cancelAnimationFrame(player.raf);
    const m = player.movie;
    if (m && !m.live) {
      if (player.t > 5 && player.t < m.dur - 30) state.progress[m.id] = Math.floor(player.t);
      else delete state.progress[m.id];
      saveProgress();
    }
  };
  function wakePlayerUI() {
    const ui = $("#playerUI"); ui.classList.remove("idle"); $("#player").classList.remove("ui-idle");
    clearTimeout(player.idleTimer);
    player.idleTimer = setTimeout(() => { if (state.screen === "player" && player.playing && !state.overlay) { ui.classList.add("idle"); $("#player").classList.add("ui-idle"); } }, 3000);
  }
  function flashGlyph(content) {
    const g = $("#playGlyph");
    g.replaceChildren(typeof content === "string" ? content : content);
    g.classList.add("show");
    clearTimeout(player.glyphTimer); player.glyphTimer = setTimeout(() => g.classList.remove("show"), 700);
  }
  function togglePlay() {
    if (player.t >= player.movie.dur) player.t = 0;
    player.playing = !player.playing;
    $("#player").classList.toggle("paused", !player.playing);
    flashGlyph(sym(player.playing ? "play" : "pause"));
  }
  function playerKey(action) {
    wakePlayerUI();
    if (action === "ok" || action === "playpause") { togglePlay(); return true; }
    if (action === "left" || action === "right") {
      if (player.movie.live) { flashGlyph("AO VIVO"); return true; }
      player.t = Math.max(0, Math.min(player.movie.dur, player.t + (action === "right" ? 10 : -10)));
      flashGlyph(sym(action === "right" ? "fwd" : "rew"));
      return true;
    }
    if (action === "down") { openInfoPanel(); return true; }
    return action === "up";
  }

  // Painel de informações (deslizar para baixo no player)
  function openInfoPanel() {
    const m = player.movie;
    const body = h("div", { class: "info-body" });
    const opt = (id, label, selected, onpick) => h("button", { class: "focusable pill opt" + (selected ? " selected" : ""), "data-fid": "opt-" + id, onclick: onpick }, selected ? sym("check") : null, label);
    const tabs = [
      ["Informações", () => h("div", { class: "info-row" },
        h("div", { class: "info-poster", html: m.live ? Art.channel(m.channel) : Art.movie(m, "poster") }),
        h("div", { class: "info-text" },
          h("h2", {}, m.live ? m.channel.show : m.title),
          h("div", { class: "meta" }, ...(m.live ? [h("b", {}, "AO VIVO"), h("span", {}, `Canal ${m.channel.n} · ${m.channel.name}`), h("span", {}, `A seguir: ${m.channel.next}`)] : [h("b", {}, m.rating), h("span", {}, String(m.year)), h("span", {}, m.genre), h("span", {}, runtime(m))])),
          h("p", {}, m.live ? "Transmissão ao vivo. Pressione Esc para voltar ao guia de canais." : m.desc)))],
      ["Legendas", () => h("div", { class: "opt-row" },
        [["off", "Desativadas"], ["pt", "Português"], ["en", "English"]].map(([id, label]) => opt("sub-" + id, label, state.subs === id, () => { state.subs = id; player.cap = null; rerender("sub-" + id); })))],
      ["Áudio", () => h("div", { class: "opt-row" },
        [["pt", "Português · Dolby Atmos"], ["en", "Inglês · 5.1"], ["ad", "Audiodescrição"]].map(([id, label]) => opt("aud-" + id, label, state.audioTrack === id, () => { state.audioTrack = id; rerender("aud-" + id); toast(`Áudio: ${label}`); })))],
    ];
    let current = 0;
    const renderBody = () => body.replaceChildren(tabs[current][1]());
    const rerender = (keepId) => { renderBody(); focus($(`[data-fid="opt-${keepId}"]`, body), { silent: true }); };
    const nav = h("nav", { class: "info-tabs" }, tabs.map(([name], i) => {
      const t = h("button", { class: "focusable tab" + (i === 0 ? " selected" : ""), "data-fid": "itab" + i }, sym(["info", "captions", "wave"][i]), name);
      t.addEventListener("tvfocus", () => { if (current !== i) { current = i; $$(".tab", nav).forEach((x, j) => x.classList.toggle("selected", j === i)); renderBody(); } });
      return t;
    }));
    renderBody();
    const panel = h("div", { class: "info-panel" }, h("div", { class: "info-inner" }, nav, body));
    panel.onArrow = (dir) => {
      if (dir === "up" && focused?.classList.contains("tab")) { closeOverlay(); return true; }
      return false;
    };
    $("#playerUI").classList.remove("idle");
    openOverlay(panel);
  }

  // ---------------------------------------------------------------- AO VIVO
  const live = { ch: 0 };
  const showProgress = (c) => ((Date.now() / 60000 + c.n * 7) % 60) / 60;
  screenInit.live = () => {
    $("#guide").replaceChildren(...CHANNELS.map((c, i) => {
      const b = h("button", { class: "focusable li", "data-fid": "ch" + i, onclick: () => watchChannel(i) },
        h("span", { class: "num" }, String(c.n)),
        h("div", { class: "grow" }, h("b", {}, c.show), h("small", {}, `${c.name} · A seguir: ${c.next}`)),
        h("span", { class: "prog" }, h("i", { style: `width:${showProgress(c) * 100}%` })));
      b.addEventListener("tvfocus", () => preview(i));
      return b;
    }));
    preview(live.ch);
    return $(`[data-fid="ch${live.ch}"]`);
  };
  function preview(i) {
    if (live.ch === i && $("#liveScene").childElementCount) return;
    live.ch = i;
    const c = CHANNELS[i];
    $("#liveScene").innerHTML = Art.channel(c, "hero");
    $("#liveNow").replaceChildren(h("small", {}, `${c.n} · ${c.name}`), h("b", {}, c.show));
    $$("#guide .li").forEach((el, j) => el.classList.toggle("current", j === i));
    setWall(`hsl(${c.hue} 60% 30%)`);
  }
  function watchChannel(i) {
    const c = CHANNELS[i];
    live.ch = i;
    go("player", { movie: { id: "live" + c.n, title: `${c.n} · ${c.name} — ${c.show}`, dur: 3600, live: true, channel: c }, from: showProgress(c) * 3600 });
  }

  // ---------------------------------------------------------------- MÚSICA (sintetizada com Web Audio)
  const music = { idx: -1, playing: false, timer: 0, step: 0 };
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  screenInit.music = () => {
    $("#tracklist").replaceChildren(...TRACKS.map((t, i) =>
      h("button", { class: "focusable li" + (i === music.idx ? " current" : ""), "data-fid": "tr" + i, onclick: () => playTrack(i) },
        h("span", { class: "thumb", html: Art.album(t, "square", false) }),
        h("div", { class: "grow" }, h("b", {}, t.name), h("small", {}, t.artist)),
        h("span", { class: "value" }, i === music.idx && music.playing ? "♪" : fmtTime(t.dur)))));
    renderNowPlaying();
    return music.idx >= 0 ? $("#musicToggle") : $('[data-fid="tr0"]');
  };
  function playTrack(i) {
    music.idx = (i + TRACKS.length) % TRACKS.length;
    music.step = 0;
    setMusicPlaying(true);
  }
  function renderNowPlaying() {
    const t = TRACKS[music.idx];
    $("#musicToggle").replaceChildren(sym(music.playing ? "pause" : "play"));
    $("#artwork").classList.toggle("paused", !music.playing);
    if (!t) { $("#artwork").innerHTML = Art.sym("wave"); return; }
    $("#trackName").textContent = t.name;
    $("#trackArtist").textContent = t.artist;
    if ($("#artwork").dataset.track !== t.name) { $("#artwork").innerHTML = Art.album(t, "square", false); $("#artwork").dataset.track = t.name; }
    $$("#tracklist .li").forEach((el, j) => {
      el.classList.toggle("current", j === music.idx);
      $(".value", el).textContent = j === music.idx && music.playing ? "♪" : fmtTime(TRACKS[j].dur);
    });
    if (state.screen === "music") setWall(t.bg);
  }
  function setMusicPlaying(on) {
    if (music.idx < 0) { if (on) playTrack(0); return; }
    music.playing = on;
    clearInterval(music.timer);
    renderNowPlaying();
    if (!on) return;
    const t = TRACKS[music.idx];
    const base = 220 * Math.pow(2, t.seed / 12);
    const rand = seeded(t.name);
    const melody = Array.from({ length: 16 }, () => SCALE[Math.floor(rand() * SCALE.length)]);
    music.timer = setInterval(() => {
      const note = melody[music.step % melody.length];
      tone(base * Math.pow(2, note / 12), 0.32, 0.045, ["triangle", "sine"][t.seed % 2]);
      if (music.step % 4 === 0) tone((base / 2) * Math.pow(2, melody[0] / 12), 0.6, 0.03, "sine");
      music.step++;
      $("#musicProgress").style.width = Math.min(100, ((music.step * 0.25) / t.dur) * 100) + "%";
      if (music.step * 0.25 >= t.dur) playTrack(music.idx + 1);
    }, 250);
  }

  // ---------------------------------------------------------------- FOTOS
  screenInit.photos = () => {
    fidN = 600;
    $("#photoGrid").replaceChildren(...PHOTOS.map((p, i) => tile("photo", { fid: "ph" + i, art: Art.photo(p), label: p.name, onclick: () => openPhoto(i) })));
    setWall(G("#ff9a8b", "#a18cd1"));
  };
  function openPhoto(i) {
    const box = h("div", { class: "lightbox" });
    const render = () => {
      const p = PHOTOS[i];
      box.innerHTML = Art.photo(p, "hero");
      box.append(h("small", {}, `${p.name} · ${i + 1} de ${PHOTOS.length}`));
      setWall(p.bg);
    };
    box.onArrow = (dir) => {
      if (dir === "left" || dir === "right") { i = (i + (dir === "right" ? 1 : -1) + PHOTOS.length) % PHOTOS.length; render(); tick(); }
      return true;
    };
    render();
    openOverlay(box);
  }

  // ---------------------------------------------------------------- CLIMA
  screenInit.weather = () => {
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const kinds = ["sun", "partly", "rain", "storm", "partly", "cloud", "sun"];
    const names = { sun: "Ensolarado", partly: "Parcialmente nublado", rain: "Chuva", storm: "Tempestade", cloud: "Nublado" };
    const today = new Date().getDay();
    $("#weather").replaceChildren(
      h("div", { class: "weather-now" },
        h("div", { html: Art.wx("sun") }),
        h("div", {}, h("div", { class: "city" }, "São Paulo"), h("div", { class: "temp" }, "26°"), h("p", {}, "Ensolarado · Máx. 29° Mín. 18°"))),
      h("div", { class: "forecast" }, kinds.map((k, i) => {
        const max = 24 + ((i * 7) % 6), min = max - 8, day = i === 0 ? "Hoje" : days[(today + i) % 7];
        return h("button", { class: "focusable li", "data-fid": "d" + i, onclick: () => toast(`${day}: ${names[k]}, ${max}° / ${min}°, chuva ${(i * 13) % 60}%`) },
          h("b", {}, day), h("span", { html: Art.wx(k) }), h("span", {}, `${max}°`), h("small", {}, `${min}°`));
      })),
    );
  };

  // ---------------------------------------------------------------- BUSCA
  let query = "";
  screenInit.search = () => {
    const kb = $("#keyboard");
    if (!kb.children.length) {
      "abcdefghijklmnopqrstuvwxyz0123456789".split("").forEach((k) =>
        kb.append(h("button", { class: "focusable key", "data-fid": "k" + k, onclick: () => typeKey(k) }, k)));
      kb.append(h("button", { class: "focusable key wide", "data-fid": "kspace", onclick: () => typeKey(" ") }, "espaço"));
      kb.append(h("button", { class: "focusable key wide", "data-fid": "kdel", onclick: () => typeKey("DEL") }, "⌫"));
      kb.append(h("button", { class: "focusable key wide", "data-fid": "kclr", onclick: () => typeKey("CLR") }, "limpar"));
    }
    renderSearch();
    setWall(G("#636366", "#1c1c1e"));
  };
  function typeKey(k) {
    if (k === "DEL") query = query.slice(0, -1);
    else if (k === "CLR") query = "";
    else if (query.length < 30) query += k;
    renderSearch();
  }
  function renderSearch() {
    fidN = 500;
    $("#searchText").textContent = query;
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = norm(query.trim());
    const res = $("#searchResults");
    if (!q) return res.replaceChildren(row("Em alta", catalog().slice(0, 8).map((m) => movieTile(m))));
    const movies = catalog().filter((m) => norm(`${m.title} ${m.genre} ${m.kind}`).includes(q));
    const people = CAST.filter((n) => norm(n).includes(q));
    const apps = APPS.filter((a) => norm(a.name).includes(q));
    const chans = CHANNELS.filter((c) => norm(c.name + " " + c.show).includes(q));
    const out = [];
    if (movies.length) out.push(row("Filmes e séries", movies.map((m) => movieTile(m))));
    if (people.length) {
      const withPerson = catalog().filter((m) => castOf(m).includes(people[0]));
      out.push(row("Pessoas", people.map((n) => personTile(n, "Elenco", G("#5e5ce6", "#1c1c1e"), "person small"))));
      if (withPerson.length) out.push(row(`Com ${people[0]}`, withPerson.map((m) => movieTile(m, "land"))));
    }
    if (chans.length) out.push(row("Canais", chans.map((c) => tile("land", { art: Art.channel(c), label: c.show, sub: `${c.n} · ${c.name}`, onclick: () => watchChannel(CHANNELS.indexOf(c)) }))));
    if (apps.length) out.push(row("Apps", apps.map((a) => tile("icon", { bg: a.bg, art: Art.icon(a.id), label: a.name, onclick: () => go(a.id) }))));
    res.replaceChildren(...(out.length ? out : [h("p", { class: "empty" }, `Nenhum resultado para “${query}”.`)]));
  }

  // ---------------------------------------------------------------- AJUSTES (duas colunas, como no tvOS)
  const OPTIONS = {
    theme: { label: "Aparência", icon: "theme", bg: G("#5e5ce6", "#1c1c1e"), hint: "Escolha entre o modo escuro e o modo claro.", values: [["dark", "Escuro"], ["light", "Claro"]] },
    accent: { label: "Cor de destaque", icon: "accent", bg: G("#ff375f", "#5e5ce6"), hint: "Cor usada em barras de progresso e realces.", values: [["blue", "Azul"], ["green", "Verde"], ["orange", "Laranja"], ["pink", "Rosa"]] },
    scale: { label: "Tamanho do texto", icon: "text", bg: G("#0a84ff", "#003a7a"), hint: "Aumente o texto para ler com conforto do sofá.", values: [[0.9, "Pequeno"], [1, "Padrão"], [1.15, "Grande"]] },
    screensaver: { label: "Protetor de tela", icon: "dunes", bg: G("#f2a65a", "#7fb1c8"), hint: "Sobrevoos aéreos aparecem após o tempo de inatividade escolhido.", values: [[30, "30 segundos"], [60, "1 minuto"], [300, "5 minutos"], [0, "Nunca"]] },
    sound: { label: "Cliques de navegação", icon: "sound", bg: G("#30d158", "#0b5d2a"), hint: "Toque um clique sutil ao mover a seleção.", values: [[true, "Ativado"], [false, "Desativado"]] },
    name: { label: "Nome da TV", icon: "tv", bg: G("#8e8e93", "#3a3a3c"), hint: "Como esta TV aparece na Central de Controle.", values: [["Sala de estar", "Sala de estar"], ["Quarto", "Quarto"], ["Escritório", "Escritório"], ["Cozinha", "Cozinha"]] },
  };
  const sideInfo = (icon, bg, hint) => { $("#settingsIcon").innerHTML = Art.sym(icon); $("#settingsIcon").style.background = bg; $("#settingsHint").textContent = hint; };
  screenInit.settings = () => {
    const list = Object.entries(OPTIONS).map(([key, o]) => {
      const cur = o.values.find(([v]) => v === state.settings[key]) || o.values[0];
      const b = h("button", { class: "focusable li", "data-fid": "set-" + key, onclick: () => cycleSetting(key) },
        h("span", { class: "li-ico", style: `background:${o.bg}`, html: Art.sym(o.icon) }),
        h("div", { class: "grow" }, o.label), h("span", { class: "value" }, cur[1] + "  ›"));
      b.addEventListener("tvfocus", () => sideInfo(o.icon, o.bg, o.hint + " Use ⬅ ➡ ou Enter para alterar."));
      return b;
    });
    const prof = h("button", { class: "focusable li", "data-fid": "set-profile", onclick: switchProfile },
      h("span", { class: "li-ico", style: `background:${state.profile.c}`, html: Art.sym("person") }),
      h("div", { class: "grow" }, "Perfil"), h("span", { class: "value" }, state.profile.name + "  ›"));
    prof.addEventListener("tvfocus", () => sideInfo("person", state.profile.c, "Cada perfil tem seu próprio progresso e sua Minha lista. O perfil Crianças mostra só conteúdo livre."));
    const reset = h("button", { class: "focusable li", "data-fid": "set-reset", onclick: resetAll },
      h("span", { class: "li-ico", style: `background:${G("#ff453a", "#8a0b05")}`, html: Art.sym("reset") }),
      h("div", { class: "grow" }, "Redefinir"), h("span", { class: "value" }, "›"));
    reset.addEventListener("tvfocus", () => sideInfo("reset", G("#ff453a", "#5c0a06"), "Apaga o progresso e a Minha lista deste perfil e volta às preferências originais."));
    const about = h("div", { class: "li static" }, h("div", { class: "grow" }, "Sobre", h("small", {}, "Aurora TV OS 3.0 · Interface web para Smart TV")), h("span", { class: "value" }, "3.0"));
    $("#settings").replaceChildren(prof, ...list, reset, about);
    setWall(G("#8e8e93", "#1c1c1e"));
  };
  function cycleSetting(key, dir = 1) {
    const vals = OPTIONS[key].values;
    const i = vals.findIndex(([v]) => v === state.settings[key]);
    state.settings[key] = vals[(i + dir + vals.length) % vals.length][0];
    store.set("settings", state.settings);
    applySettings();
    if (state.screen === "settings") { screenInit.settings(); focus($(`[data-fid="set-${key}"]`), { silent: true }); }
  }
  function resetAll() {
    state.settings = { ...DEFAULTS }; state.progress = {}; state.mylist = [];
    store.set("settings", state.settings); saveProgress(); store.set(pkey("mylist"), []);
    applySettings(); screenInit.settings();
    focus($('[data-fid="set-reset"]'), { silent: true });
    toast("Ajustes redefinidos");
  }
  function applySettings() {
    const s = state.settings, root = document.documentElement;
    root.dataset.theme = s.theme;
    root.dataset.accent = s.accent;
    root.style.setProperty("--scale", s.scale);
  }
  function switchProfile() {
    if (state.overlay) closeOverlay();
    screenLeave[state.screen]?.();
    state.history = [];
    show("profiles");
  }

  // ---------------------------------------------------------------- Central de Controle
  function openControlCenter() {
    if (state.overlay?.classList.contains("cc")) return closeOverlay();
    if (state.overlay) closeOverlay();
    const now = new Date();
    const t = TRACKS[music.idx];
    const reopen = (fn) => () => { fn(); closeOverlay(); openControlCenter(); };
    const ccItem = (ico, label, sub, fn, extra = "") => h("button", { class: "focusable li" + extra, onclick: fn }, sym(ico), h("div", {}, label, h("small", {}, sub)));
    const panel = h("div", { class: "cc-panel" },
      h("div", { class: "cc-time" }, clockText()),
      h("div", { class: "cc-date" }, now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) + " · " + state.settings.name),
      h("div", { class: "cc-profile" }, h("span", { class: "who big", style: `background:${state.profile.c}` }, initials(state.profile.name).slice(0, 1)), h("div", {}, state.profile.name, h("small", {}, "Perfil atual"))),
      h("div", { class: "cc-grid" },
        ccItem("power", "Repousar", "Protetor de tela", () => { closeOverlay(); $("#screensaver").classList.add("on"); }),
        ccItem(state.settings.theme === "dark" ? "moon" : "sun", "Aparência", state.settings.theme === "dark" ? "Escuro" : "Claro", reopen(() => cycleSetting("theme"))),
        ccItem(music.playing ? "pause" : "play", t ? t.name : "Música", t ? t.artist : "Nada tocando", reopen(() => setMusicPlaying(!music.playing)), " wide"),
        ccItem("person", "Trocar perfil", "Quem está assistindo?", switchProfile),
        ccItem("search", "Buscar", "Filmes e canais", () => { closeOverlay(); go("search"); }),
        ccItem("gear", "Ajustes", "Abrir", () => { closeOverlay(); go("settings"); }),
      ));
    openOverlay(h("div", { class: "cc" }, panel));
  }

  // ---------------------------------------------------------------- relógio e protetor de tela
  const clockText = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const updateClock = () => { $("#clock").textContent = clockText(); $("#ssClock").textContent = clockText(); };
  setInterval(updateClock, 1000); updateClock();

  let idleAt = Date.now();
  setInterval(() => {
    const limit = state.settings.screensaver;
    const busy = (state.screen === "player" && player.playing) || music.playing;
    if (limit && !busy && Date.now() - idleAt > limit * 1000) $("#screensaver").classList.add("on");
  }, 1000);
  const wake = () => {
    idleAt = Date.now();
    const ss = $("#screensaver");
    if (ss.classList.contains("on")) { ss.classList.remove("on"); return true; }
    return false;
  };

  // ---------------------------------------------------------------- entrada (teclado / controle remoto / mouse)
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Enter: "ok", " ": "ok", Escape: "back", Backspace: "back", BrowserBack: "back", GoBack: "back",
    h: "home", H: "home", Home: "home", c: "cc", C: "cc",
    MediaPlayPause: "playpause", p: "playpause", P: "playpause",
  };
  const CODEMAP = { 10009: "back", 461: "back", 415: "playpause", 19: "playpause", 10252: "playpause" }; // Tizen / webOS
  let homeHeld = 0, homeDown = false;

  document.addEventListener("keydown", (e) => {
    if (!$("#boot").classList.contains("hide")) return;
    const action = KEYMAP[e.key] || CODEMAP[e.keyCode];
    if (wake()) { e.preventDefault(); return; }
    // Na busca, letras e números digitam
    if (state.screen === "search" && !state.overlay && /^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); return typeKey(e.key.toLowerCase()); }
    if (state.screen === "search" && !state.overlay && e.key === "Backspace" && query) { e.preventDefault(); return typeKey("DEL"); }
    if (!action) return;
    e.preventDefault();
    // Segurar Início abre a Central de Controle, como no controle da TV
    if (action === "home") {
      if (e.repeat) { if (++homeHeld === 6) openControlCenter(); return; }
      homeHeld = 0; homeDown = true; return;
    }
    if (state.screen === "player" && !state.overlay && playerKey(action)) return;
    if (["up", "down", "left", "right"].includes(action)) {
      if (state.overlay?.onArrow?.(action)) return;
      if (state.screen === "settings" && !state.overlay && (action === "left" || action === "right") && OPTIONS[focused?.dataset.fid?.slice(4)]) {
        tick(); return cycleSetting(focused.dataset.fid.slice(4), action === "right" ? 1 : -1);
      }
      return move(action);
    }
    if (action === "ok") { if (focused) { tick(2400); focused.click(); } return; }
    if (action === "back") return back();
    if (action === "cc") return openControlCenter();
    if (action === "playpause") {
      if (state.screen === "player") return togglePlay();
      if (music.idx >= 0) return setMusicPlaying(!music.playing);
    }
  });
  document.addEventListener("keyup", (e) => {
    if (KEYMAP[e.key] === "home" && homeDown && homeHeld < 6 && state.screen !== "profiles") home();
    homeDown = false; homeHeld = 0;
  });

  // Mouse: passar o cursor foca e inclina o cartão, como o touch do controle
  document.addEventListener("mousemove", (e) => {
    wake();
    if (state.screen === "player") wakePlayerUI();
    const el = e.target.closest?.(".focusable");
    if (el && el !== focused && scope().contains(el)) focus(el, { silent: true });
    if (el && el === focused && el.classList.contains("tile")) {
      const r = $(".art", el).getBoundingClientRect();
      const px = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
      const py = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
      clearTimeout(tiltTimer);
      setTilt(el, -py * 14, px * 14, (px + 0.5) * 100, (py + 0.5) * 100);
    }
  });
  document.addEventListener("click", (e) => {
    wake();
    if (state.overlay && e.target === state.overlay) return back();
    if (state.screen === "player" && !state.overlay && e.target.closest(".player")) return togglePlay();
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === "music-toggle") setMusicPlaying(!music.playing);
    if (a === "music-next") playTrack(music.idx + 1);
    if (a === "music-prev") playTrack(music.idx - 1);
  });
  document.addEventListener("contextmenu", (e) => { e.preventDefault(); back(); });

  // ---------------------------------------------------------------- boot
  $$("[data-sym]").forEach((el) => (el.innerHTML = Art.sym(el.dataset.sym)));
  applySettings();
  loadProfileData();
  renderWho();
  show("profiles");
  setTimeout(() => $("#boot").classList.add("hide"), 1900);
})();
