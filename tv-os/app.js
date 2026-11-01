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
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  };
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

  // ---------------------------------------------------------------- dados
  const G = (a, b) => `linear-gradient(135deg, ${a}, ${b})`;
  const MOVIES = [
    { id: "m1", title: "Horizonte Vermelho", year: 2025, genre: "Ficção científica", kind: "filme", rating: "14", dur: 7980, emoji: "🚀", bg: G("#ff4d6d", "#3a0ca3"), desc: "Uma tripulação perdida em Marte descobre um sinal que muda tudo o que sabemos sobre a origem da vida." },
    { id: "m2", title: "O Último Samba", year: 2024, genre: "Drama", kind: "filme", rating: "12", dur: 6420, emoji: "🎺", bg: G("#f8961e", "#6a040f"), desc: "Um músico veterano do Rio de Janeiro reúne a antiga banda para uma última apresentação no Carnaval." },
    { id: "m3", title: "Floresta Viva", year: 2026, genre: "Documentário", kind: "filme", rating: "L", dur: 5400, emoji: "🌳", bg: G("#2d6a4f", "#95d5b2"), desc: "Uma jornada pela Amazônia revelando espécies nunca antes filmadas." },
    { id: "m4", title: "Código Fantasma", year: 2025, genre: "Suspense", kind: "filme", rating: "16", dur: 7200, emoji: "👻", bg: G("#212529", "#5b8cff"), desc: "Uma hacker descobre que a IA que ajudou a criar está apagando pessoas da internet — e da realidade." },
    { id: "m5", title: "Pequenos Gigantes", year: 2023, genre: "Animação", kind: "filme", rating: "L", dur: 5700, emoji: "🐜", bg: G("#ffbe0b", "#fb5607"), desc: "Uma colônia de formigas precisa salvar o jardim antes da chegada do inverno." },
    { id: "m6", title: "Maré Alta", year: 2026, genre: "Ação", kind: "filme", rating: "14", dur: 6900, emoji: "🌊", bg: G("#0077b6", "#00b4d8"), desc: "Uma equipe de resgate enfrenta a maior tempestade do século na costa brasileira." },
    { id: "m7", title: "Cozinha de Vó", year: 2024, genre: "Culinária", kind: "série", rating: "L", dur: 2700, emoji: "🍲", bg: G("#bc6c25", "#dda15e"), desc: "Receitas de família de todo o Brasil, contadas por quem as preparou por gerações." },
    { id: "m8", title: "Noite Neon", year: 2025, genre: "Policial", kind: "série", rating: "16", dur: 3300, emoji: "🌃", bg: G("#7209b7", "#f72585"), desc: "Dois detetives investigam crimes em uma metrópole que nunca dorme." },
    { id: "m9", title: "Galáxia Kids", year: 2026, genre: "Infantil", kind: "série", rating: "L", dur: 1500, emoji: "🪐", bg: G("#4361ee", "#4cc9f0"), desc: "Aventuras educativas pelo sistema solar com a robô Lila." },
    { id: "m10", title: "Rota 66", year: 2022, genre: "Comédia", kind: "filme", rating: "12", dur: 6000, emoji: "🚗", bg: G("#e76f51", "#264653"), desc: "Três amigos, um carro velho e uma viagem que não sai nada como o planejado." },
    { id: "m11", title: "Vale do Silício Tropical", year: 2026, genre: "Comédia", kind: "série", rating: "12", dur: 1800, emoji: "💻", bg: G("#06d6a0", "#073b4c"), desc: "Uma startup de Recife tenta conquistar o mundo com um app que ninguém entende." },
  ];
  const CHANNELS = [
    { n: 2, name: "Aurora News", show: "Jornal da Tarde", next: "Esportes ao Vivo", hue: 210, ico: "📰" },
    { n: 4, name: "Esporte+", show: "Futebol: Final do Campeonato", next: "Mesa Redonda", hue: 130, ico: "⚽" },
    { n: 5, name: "Cine Clássico", show: "Sessão da Tarde", next: "Grandes Diretores", hue: 30, ico: "🎞️" },
    { n: 7, name: "Kids Planet", show: "Galáxia Kids", next: "Desenhos Animados", hue: 280, ico: "🧸" },
    { n: 9, name: "Natureza HD", show: "Oceanos Profundos", next: "Vida Selvagem", hue: 180, ico: "🐋" },
    { n: 11, name: "Música TV", show: "Top 20 da Semana", next: "Acústico", hue: 330, ico: "🎤" },
    { n: 13, name: "Gourmet", show: "Chef em Casa", next: "Desafio dos Doces", hue: 15, ico: "🍰" },
  ];
  const TRACKS = [
    { name: "Luz do Amanhã", artist: "Aurora Band", dur: 32, seed: 1, ico: "🌅", bg: G("#ff9a8b", "#ff6a88") },
    { name: "Café com Chuva", artist: "Lofi Rio", dur: 28, seed: 2, ico: "☕", bg: G("#a18cd1", "#5b4b8a") },
    { name: "Ondas Digitais", artist: "Synth Paulista", dur: 30, seed: 3, ico: "🌐", bg: G("#00c6fb", "#005bea") },
    { name: "Estrada Azul", artist: "Mar & Serra", dur: 26, seed: 4, ico: "🛣️", bg: G("#43e97b", "#1f8a70") },
    { name: "Noite de São João", artist: "Forró Eletrônico", dur: 34, seed: 5, ico: "🔥", bg: G("#f83600", "#f9d423") },
    { name: "Pixel Bossa", artist: "8-bit Brasil", dur: 30, seed: 6, ico: "👾", bg: G("#fa709a", "#7f00ff") },
  ];
  const PHOTOS = [
    ["🏖️", "Praia do Forte", G("#48cae4", "#ffd166")], ["🏔️", "Serra da Mantiqueira", G("#6c757d", "#adb5bd")],
    ["🌅", "Pôr do sol", G("#ff7b00", "#ff006e")], ["🐶", "Thor", G("#ddb892", "#7f5539")],
    ["🎂", "Aniversário", G("#ff99c8", "#a9def9")], ["🌵", "Chapada", G("#e9c46a", "#2a9d8f")],
    ["🏙️", "São Paulo", G("#343a40", "#5b8cff")], ["🎡", "Parque", G("#f72585", "#7209b7")],
    ["🌻", "Jardim", G("#ffd60a", "#588157")], ["⛵", "Veleiro", G("#00b4d8", "#03045e")],
    ["🦜", "Arara", G("#ef233c", "#2b9348")], ["🌌", "Via Láctea", G("#10002b", "#5a189a")],
  ];
  const APPS = [
    { id: "movies", name: "TV", ico: "🎬", bg: G("#1c1c1e", "#3a3a3c"), tag: "Assista agora", desc: "Filmes e séries escolhidos para você." },
    { id: "live", name: "Ao Vivo", ico: "📡", bg: G("#ff453a", "#a3001b"), tag: "Canais", desc: "Seus canais favoritos, ao vivo." },
    { id: "music", name: "Música", ico: "♫", bg: G("#ff375f", "#ff2d55"), tag: "Ouvidas recentemente", desc: "Suas faixas e playlists." },
    { id: "photos", name: "Fotos", ico: "🌸", bg: G("#ffffff", "#e5e5ea"), dark: true, tag: "Memórias", desc: "Reviva seus melhores momentos na tela grande." },
    { id: "weather", name: "Clima", ico: "⛅", bg: G("#1e6fd9", "#5aa9f0"), tag: "São Paulo", desc: "26° e ensolarado. Máxima de 29°, mínima de 18°." },
    { id: "search", name: "Buscar", ico: "⌕", bg: G("#636366", "#2c2c2e"), tag: "Buscar", desc: "Encontre filmes, séries, canais e apps." },
    { id: "settings", name: "Ajustes", ico: "⚙︎", bg: G("#8e8e93", "#48484a"), tag: "Ajustes", desc: "Aparência, protetor de tela, sons e mais." },
  ];

  // ---------------------------------------------------------------- estado
  const DEFAULTS = { theme: "dark", accent: "blue", scale: 1, name: "Sala de estar", screensaver: 60, sound: true };
  const state = {
    screen: "home", opts: {}, history: [], overlay: null,
    progress: store.get("progress", {}),
    mylist: store.get("mylist", []),
    settings: Object.assign({}, DEFAULTS, store.get("settings", {})),
    movieTab: 0,
    shelfApp: null,
  };

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

  // ---------------------------------------------------------------- motor de foco (navegação espacial)
  let focused = null;
  const scope = () => state.overlay || $(`.screen[data-screen="${state.screen}"]`);
  const visibleFocusables = () => $$(".focusable", scope()).filter((el) => el.offsetParent !== null);
  const TILT = { left: [0, -7], right: [0, 7], up: [7, 0], down: [-7, 0] };
  let tiltTimer;

  function focus(el, { silent, dir } = {}) {
    if (!el) return;
    if (focused && focused !== el) { focused.classList.remove("focused"); focused.style.removeProperty("--rx"); focused.style.removeProperty("--ry"); }
    focused = el;
    el.classList.add("focused");
    // Inclinação breve no sentido do movimento, como o "deslizar" no touch do controle
    if (dir && el.classList.contains("tile")) {
      const [rx, ry] = TILT[dir];
      el.style.setProperty("--rx", rx + "deg"); el.style.setProperty("--ry", ry + "deg");
      el.style.setProperty("--gx", 50 + ry * 4 + "%"); el.style.setProperty("--gy", Math.max(0, 10 - rx * 2) + "%");
      clearTimeout(tiltTimer);
      tiltTimer = setTimeout(() => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); }, 220);
    }
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
    else if (focused.classList.contains("tile")) { // "batida" na borda
      const [rx, ry] = TILT[dir];
      focused.style.setProperty("--rx", rx * 1.4 + "deg"); focused.style.setProperty("--ry", ry * 1.4 + "deg");
      setTimeout(() => { focused?.style.setProperty("--rx", "0deg"); focused?.style.setProperty("--ry", "0deg"); }, 160);
    }
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
    if (!prev) return;
    screenLeave[state.screen]?.();
    tick(1200);
    show(prev.screen, { ...prev.opts, focusId: prev.focusId });
  }
  function home() {
    if (state.overlay) closeOverlay();
    if (state.screen === "home") return;
    screenLeave[state.screen]?.();
    const first = state.history[0];
    state.history = [];
    show("home", { focusId: first?.screen === "home" ? first.focusId : undefined });
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
    const el = h("button", { class: `focusable tile ${kind}`, "data-fid": o.fid || fid(), "aria-label": o.label, onclick: o.onclick },
      h("div", { class: "art", style: `background:${o.bg}${o.dark ? ";color:#1d1d1f" : ""}` },
        o.glyph ? h("span", { class: "glyph" }, o.glyph) : null,
        o.titleOnArt ? h("span", { class: "title-on-art" }, o.label) : null,
        o.progress ? h("div", { class: "bar" }, h("i", { style: `width:${o.progress * 100}%` })) : null),
      o.caption === false ? null : h("div", { class: "cap" }, o.label, o.sub ? h("small", {}, o.sub) : null));
    if (o.onfocus) el.addEventListener("tvfocus", o.onfocus);
    return el;
  }
  const row = (title, items) => h("div", { class: "row" }, h("h3", {}, title), h("div", { class: "row-track" }, items));
  const progressOf = (m) => (state.progress[m.id] ? state.progress[m.id] / m.dur : 0);
  const movieTile = (m, kind = "poster") => tile(kind, {
    bg: m.bg, glyph: m.emoji, label: m.title, sub: kind === "poster" ? null : `${m.genre} · ${m.year}`,
    titleOnArt: kind === "land", progress: progressOf(m),
    onclick: () => go("details", { movie: m }),
  });
  const setWall = (bg) => document.documentElement.style.setProperty("--wall", bg);

  // ---------------------------------------------------------------- HOME (Top Shelf + grade de apps)
  screenInit.home = () => {
    fidN = 0;
    $("#appGrid").replaceChildren(...APPS.map((a) => tile("icon", {
      fid: "app-" + a.id, bg: a.bg, dark: a.dark, glyph: a.ico, label: a.name,
      onclick: () => go(a.id), onfocus: () => renderShelf(a),
    })));
    state.shelfApp = null;
    return $("#app-movies") || $('[data-fid="app-movies"]');
  };

  function shelfHero({ bg, glyph, tag, title, desc }) {
    $("#shelfBg").style.background = bg;
    $("#shelfBg").replaceChildren(glyph ? h("div", { class: "big-glyph" }, glyph) : "");
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
    if (app.id === "movies") {
      const cont = MOVIES.filter((m) => state.progress[m.id]);
      const list = [...cont, ...MOVIES.filter((m) => !state.progress[m.id])].slice(0, 6);
      items = list.map((m) => { const t = movieTile(m, "land"); t.addEventListener("tvfocus", () => shelfHero({ bg: m.bg, glyph: m.emoji, tag: state.progress[m.id] ? "Continuar assistindo" : "Em destaque", title: m.title })); return t; });
    } else if (app.id === "live") {
      items = CHANNELS.map((c, i) => tile("land", {
        bg: `linear-gradient(135deg, hsl(${c.hue} 70% 45%), hsl(${c.hue + 30} 70% 20%))`, glyph: c.ico, label: `${c.n} · ${c.name}`, sub: c.show,
        onclick: () => { live.ch = i; watchChannel(i); },
        onfocus: () => shelfHero({ bg: `linear-gradient(135deg, hsl(${c.hue} 70% 35%), #000)`, glyph: c.ico, tag: "Ao vivo agora", title: c.show }),
      }));
    } else if (app.id === "music") {
      items = TRACKS.map((t, i) => tile("square", {
        bg: t.bg, glyph: t.ico, label: t.name, sub: t.artist,
        onclick: () => { go("music"); playTrack(i); },
        onfocus: () => shelfHero({ bg: t.bg, glyph: t.ico, tag: t.artist, title: t.name }),
      }));
    } else if (app.id === "photos") {
      items = PHOTOS.slice(0, 6).map(([e, name, bg], i) => tile("land", {
        bg, glyph: e, label: name, onclick: () => { go("photos"); openPhoto(i); },
        onfocus: () => shelfHero({ bg, glyph: e, tag: "Memórias", title: name }),
      }));
    }
    $("#shelf").classList.toggle("has-row", items.length > 0);
    $("#shelfRow").replaceChildren(...items);
    const first = app.id === "movies" ? MOVIES.find((m) => state.progress[m.id]) || MOVIES[0] : null;
    shelfHero(first
      ? { bg: first.bg, glyph: first.emoji, tag: app.tag, title: first.title, desc: first.desc }
      : { bg: app.id === "photos" ? G("#ff9a8b", "#a18cd1") : app.bg, glyph: app.ico, tag: app.tag, title: app.name, desc: app.desc });
  }

  // ---------------------------------------------------------------- TV (abas + conteúdo)
  const TABS = [
    ["Assistir agora", () => MOVIES],
    ["Filmes", () => MOVIES.filter((m) => m.kind === "filme")],
    ["Séries", () => MOVIES.filter((m) => m.kind === "série")],
    ["Infantil", () => MOVIES.filter((m) => m.rating === "L")],
    ["Minha lista", () => MOVIES.filter((m) => state.mylist.includes(m.id))],
  ];
  screenInit.movies = () => {
    $("#movieTabs").replaceChildren(...TABS.map(([name], i) => {
      const t = h("button", { class: "focusable tab" + (i === state.movieTab ? " selected" : ""), "data-fid": "tab" + i }, name);
      t.addEventListener("tvfocus", () => { $("#movieContent").scrollTo({ top: 0, behavior: "smooth" }); if (state.movieTab !== i) { state.movieTab = i; renderMovieTab(); } });
      return t;
    }));
    renderMovieTab();
    return $('#movieContent .pill.primary') || null;
  };
  function renderMovieTab() {
    fidN = 100;
    $$("#movieTabs .tab").forEach((t, i) => t.classList.toggle("selected", i === state.movieTab));
    const list = TABS[state.movieTab][1]();
    const out = [];
    if (!list.length) out.push(h("p", { class: "empty", style: "padding-top:60px" }, "Nada aqui ainda. Use “＋ Minha lista” na página de um título."));
    else {
      out.push(hero(list.find((m) => m.year >= 2026) || list[0]));
      const cont = list.filter((m) => state.progress[m.id]);
      if (cont.length) out.push(row("Continuar assistindo", cont.map((m) => movieTile(m, "land"))));
      out.push(row("Novidades", [...list].sort((a, b) => b.year - a.year).map((m) => movieTile(m))));
      const genres = {};
      list.forEach((m) => (genres[m.genre] ||= []).push(m));
      const multi = Object.entries(genres).filter(([, l]) => l.length > 1);
      multi.forEach(([g, l]) => out.push(row(g, l.map((m) => movieTile(m, "land")))));
      if (!multi.length) out.push(row("Para você", list.map((m) => movieTile(m, "land"))));
    }
    $("#movieContent").replaceChildren(...out);
  }
  function hero(m, { details = false } = {}) {
    const p = state.progress[m.id];
    const inList = state.mylist.includes(m.id);
    setWall(m.bg);
    return h("div", { class: "hero" },
      h("div", { class: "hero-bg", style: `background:${m.bg}` }, h("div", { class: "big-glyph" }, m.emoji)),
      h("div", { class: "hero-text" },
        h("small", {}, details ? m.kind : "Em destaque"),
        h("h1", {}, m.title),
        h("div", { class: "meta" }, h("b", {}, m.rating), h("span", {}, String(m.year)), h("span", {}, "·"), h("span", {}, m.genre), h("span", {}, "·"), h("span", {}, m.kind === "série" ? "1 temporada" : `${Math.floor(m.dur / 3600)} h ${Math.round((m.dur % 3600) / 60)} min`), h("span", {}, "4K · HDR")),
        h("p", {}, m.desc),
        h("div", { class: "actions" },
          h("button", { class: "focusable pill primary", "data-fid": "play-" + m.id, onclick: () => go("player", { movie: m, from: p || 0 }) }, p ? `▶ Continuar · ${fmtTime(m.dur - p)} restantes` : "▶ Reproduzir"),
          details && p ? h("button", { class: "focusable pill", onclick: () => go("player", { movie: m, from: 0 }) }, "↺ Do início") : null,
          details ? null : h("button", { class: "focusable pill", onclick: () => go("details", { movie: m }) }, "Detalhes"),
          h("button", { class: "focusable pill circle", "aria-label": "Minha lista", onclick: (e) => toggleList(m, e.currentTarget) }, inList ? "✓" : "＋"),
        )));
  }
  function toggleList(m, btn) {
    const i = state.mylist.indexOf(m.id);
    if (i >= 0) state.mylist.splice(i, 1); else state.mylist.push(m.id);
    store.set("mylist", state.mylist);
    btn.textContent = i >= 0 ? "＋" : "✓";
    toast(i >= 0 ? "Removido da Minha lista" : "Adicionado à Minha lista");
  }

  // ---------------------------------------------------------------- DETALHES
  screenInit.details = ({ movie: m } = {}) => {
    if (!m) return;
    fidN = 300;
    const similar = MOVIES.filter((x) => x.id !== m.id && (x.genre === m.genre || x.kind === m.kind));
    $("#details").replaceChildren(
      hero(m, { details: true }),
      similar.length ? row("Mais como este", similar.map((x) => movieTile(x, "land"))) : null,
      h("div", { class: "row" }, h("h3", {}, "Sobre"), h("p", { class: "empty", style: "line-height:1.6;max-width:900px" },
        `${m.title} (${m.year}) · ${m.genre} · Classificação ${m.rating === "L" ? "livre" : m.rating + " anos"}. Disponível em 4K, Dolby Vision e áudio espacial. Legendas e áudio em português.`)),
    );
    $("#details").scrollTop = 0;
    return $("#details .pill.primary");
  };

  // ---------------------------------------------------------------- PLAYER (vídeo gerado em canvas)
  const player = { raf: 0, playing: true, t: 0, movie: null, last: 0, idleTimer: 0, glyphTimer: 0 };
  screenInit.player = ({ movie, from = 0 } = {}) => {
    if (!movie) return;
    Object.assign(player, { movie, t: from, playing: true, last: performance.now() });
    $("#playerTitle").textContent = movie.title;
    const canvas = $("#playerCanvas"), ctx = canvas.getContext("2d");
    const hue = [...movie.id].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - player.last) / 1000); player.last = now;
      if (player.playing) player.t = Math.min(movie.dur, player.t + dt);
      const w = (canvas.width = canvas.clientWidth), hgt = (canvas.height = canvas.clientHeight);
      const g = ctx.createLinearGradient(0, 0, w, hgt);
      g.addColorStop(0, `hsl(${(hue + player.t * 4) % 360} 70% 22%)`);
      g.addColorStop(1, `hsl(${(hue + 120 + player.t * 4) % 360} 70% 10%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
      for (let i = 0; i < 14; i++) {
        const x = w / 2 + Math.cos(player.t * 0.3 + i) * w * 0.35 * Math.sin(i * 1.7);
        const y = hgt / 2 + Math.sin(player.t * 0.4 + i * 2) * hgt * 0.3;
        ctx.beginPath(); ctx.arc(x, y, Math.abs(30 + 25 * Math.sin(player.t + i)), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${(hue + i * 25) % 360} 90% 65% / .22)`; ctx.fill();
      }
      ctx.font = `${Math.round(hgt / 5)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(movie.emoji, w / 2, hgt / 2 + Math.sin(player.t) * 10);
      const pct = (player.t / movie.dur) * 100;
      $("#playerProgress").style.width = pct + "%";
      $("#playerKnob").style.left = pct + "%";
      $("#tElapsed").textContent = fmtTime(player.t);
      $("#tRemain").textContent = "-" + fmtTime(movie.dur - player.t);
      if (player.t >= movie.dur && player.playing) { player.playing = false; wakePlayerUI(); }
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
      store.set("progress", state.progress);
    }
  };
  function wakePlayerUI() {
    const ui = $("#playerUI"); ui.classList.remove("idle");
    clearTimeout(player.idleTimer);
    player.idleTimer = setTimeout(() => state.screen === "player" && player.playing && ui.classList.add("idle"), 3000);
  }
  function flashGlyph(text) {
    const g = $("#playGlyph"); g.textContent = text; g.classList.add("show");
    clearTimeout(player.glyphTimer); player.glyphTimer = setTimeout(() => g.classList.remove("show"), 700);
  }
  function playerKey(action) {
    wakePlayerUI();
    if (action === "ok" || action === "playpause") {
      if (player.t >= player.movie.dur) player.t = 0;
      player.playing = !player.playing;
      flashGlyph(player.playing ? "▶" : "❚❚");
      return true;
    }
    if (action === "left" || action === "right") {
      if (player.movie.live) { flashGlyph("●"); return true; }
      player.t = Math.max(0, Math.min(player.movie.dur, player.t + (action === "right" ? 10 : -10)));
      flashGlyph(action === "right" ? "+10" : "−10");
      return true;
    }
    return action === "up" || action === "down";
  }

  // ---------------------------------------------------------------- AO VIVO
  const live = { raf: 0, ch: 0 };
  screenInit.live = () => {
    $("#guide").replaceChildren(...CHANNELS.map((c, i) => {
      const b = h("button", { class: "focusable li", "data-fid": "ch" + i, onclick: () => watchChannel(i) },
        h("span", { class: "num" }, String(c.n)),
        h("div", { class: "grow" }, h("b", {}, c.name), h("small", {}, `Agora: ${c.show}`), h("small", {}, `A seguir: ${c.next}`)),
        h("span", { class: "value" }, c.ico));
      b.addEventListener("tvfocus", () => preview(i));
      return b;
    }));
    preview(live.ch);
    const canvas = $("#liveCanvas"), ctx = canvas.getContext("2d");
    const loop = (now) => {
      const c = CHANNELS[live.ch], t = now / 1000;
      const w = (canvas.width = canvas.clientWidth), hgt = (canvas.height = canvas.clientHeight);
      const g = ctx.createLinearGradient(0, 0, w, hgt);
      g.addColorStop(0, `hsl(${c.hue} 60% 30%)`); g.addColorStop(1, `hsl(${c.hue + 40} 60% 8%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `hsla(${c.hue + i * 10} 80% 65% / .25)`;
        const bw = w / 10, bh = hgt * (0.25 + 0.2 * Math.sin(t * 1.4 + i));
        ctx.beginPath(); ctx.roundRect(i * bw + 6, hgt - bh, bw - 12, bh, 8); ctx.fill();
      }
      ctx.font = `${Math.round(hgt / 4)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(c.ico, w / 2, hgt / 2.6 + Math.sin(t * 2) * 6);
      live.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(live.raf);
    live.raf = requestAnimationFrame(loop);
    return $(`[data-fid="ch${live.ch}"]`);
  };
  screenLeave.live = () => cancelAnimationFrame(live.raf);
  function preview(i) {
    live.ch = i;
    const c = CHANNELS[i];
    $("#liveNow").replaceChildren(h("b", {}, `${c.n} · ${c.name}`), h("br"), c.show);
    $$("#guide .li").forEach((el, j) => el.classList.toggle("current", j === i));
    setWall(`hsl(${c.hue} 60% 30%)`);
  }
  function watchChannel(i) {
    const c = CHANNELS[i];
    go("player", { movie: { id: "live" + c.n, title: `${c.n} · ${c.name} — ${c.show}`, dur: 3600, emoji: c.ico, live: true }, from: (Date.now() / 1000) % 3600 });
  }

  // ---------------------------------------------------------------- MÚSICA (sintetizada com Web Audio)
  const music = { idx: -1, playing: false, timer: 0, step: 0 };
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  screenInit.music = () => {
    $("#tracklist").replaceChildren(...TRACKS.map((t, i) =>
      h("button", { class: "focusable li" + (i === music.idx ? " current" : ""), "data-fid": "tr" + i, onclick: () => playTrack(i) },
        h("span", { class: "num" }, i === music.idx && music.playing ? "♪" : String(i + 1)),
        h("div", { class: "grow" }, h("b", {}, t.name), h("small", {}, t.artist)),
        h("span", { class: "value" }, fmtTime(t.dur)))));
    if (music.idx >= 0) setWall(TRACKS[music.idx].bg);
    $("#artwork").classList.toggle("paused", !music.playing);
    return music.idx >= 0 ? $('[data-action="music-toggle"]') : $('[data-fid="tr0"]');
  };
  function playTrack(i) {
    music.idx = (i + TRACKS.length) % TRACKS.length;
    music.step = 0;
    setMusicPlaying(true);
  }
  function renderNowPlaying() {
    const t = TRACKS[music.idx];
    if (!t) return;
    $("#trackName").textContent = t.name;
    $("#trackArtist").textContent = t.artist;
    $("#artwork").style.background = t.bg;
    $("#artGlyph").textContent = t.ico;
    $("#artwork").classList.toggle("paused", !music.playing);
    $("#musicToggle").textContent = music.playing ? "❚❚" : "▶";
    $$("#tracklist .li").forEach((el, j) => {
      el.classList.toggle("current", j === music.idx);
      $(".num", el).textContent = j === music.idx && music.playing ? "♪" : String(j + 1);
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
    let rnd = t.seed * 9301;
    const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    const melody = Array.from({ length: 16 }, () => SCALE[Math.floor(rand() * SCALE.length)]);
    music.timer = setInterval(() => {
      const note = melody[music.step % melody.length];
      tone(base * Math.pow(2, note / 12), 0.32, 0.045, ["triangle", "sine"][t.seed % 2]);
      if (music.step % 4 === 0) tone(base / 2 * Math.pow(2, melody[0] / 12), 0.6, 0.03, "sine");
      music.step++;
      $("#musicProgress").style.width = Math.min(100, (music.step * 0.25 / t.dur) * 100) + "%";
      if (music.step * 0.25 >= t.dur) playTrack(music.idx + 1);
    }, 250);
  }

  // ---------------------------------------------------------------- FOTOS
  screenInit.photos = () => {
    fidN = 600;
    $("#photoGrid").replaceChildren(...PHOTOS.map(([e, name, bg], i) =>
      tile("photo", { fid: "ph" + i, bg, glyph: e, label: name, onclick: () => openPhoto(i) })));
    setWall(G("#ff9a8b", "#a18cd1"));
  };
  function openPhoto(i) {
    const box = h("div", { class: "lightbox" });
    const render = () => {
      const [e, name, bg] = PHOTOS[i];
      box.style.background = bg;
      box.replaceChildren(e, h("small", {}, `${name} · ${i + 1} de ${PHOTOS.length}`));
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
    const icons = ["☀️", "⛅", "🌧️", "⛈️", "🌤️", "☁️"];
    const today = new Date().getDay();
    $("#weather").replaceChildren(
      h("div", { class: "weather-now" },
        h("div", { class: "city" }, "São Paulo"),
        h("div", { class: "temp" }, "26°"),
        h("p", {}, "Ensolarado"), h("p", {}, "Máx.: 29°  Mín.: 18°")),
      h("div", { class: "forecast" }, Array.from({ length: 7 }, (_, i) => {
        const max = 24 + ((i * 7) % 6), min = max - 8;
        return h("button", { class: "focusable li", "data-fid": "d" + i, onclick: () => toast(`${i === 0 ? "Hoje" : days[(today + i) % 7]}: ${max}° / ${min}° · chuva ${(i * 13) % 60}%`) },
          h("b", {}, i === 0 ? "Hoje" : days[(today + i) % 7]),
          h("span", { class: "ico" }, icons[(i * 5) % icons.length]),
          h("span", {}, `${max}°`), h("small", {}, `${min}°`));
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
    if (!q) return res.replaceChildren(row("Em alta", MOVIES.slice(0, 7).map((m) => movieTile(m))));
    const movies = MOVIES.filter((m) => norm(`${m.title} ${m.genre} ${m.kind}`).includes(q));
    const apps = APPS.filter((a) => norm(a.name).includes(q));
    const chans = CHANNELS.filter((c) => norm(c.name + " " + c.show).includes(q));
    const out = [];
    if (movies.length) out.push(row("Filmes e séries", movies.map((m) => movieTile(m))));
    if (chans.length) out.push(row("Canais", chans.map((c) => tile("land", {
      bg: `linear-gradient(135deg, hsl(${c.hue} 70% 45%), hsl(${c.hue + 30} 70% 20%))`, glyph: c.ico, label: `${c.n} · ${c.name}`, sub: c.show,
      onclick: () => watchChannel(CHANNELS.indexOf(c)),
    }))));
    if (apps.length) out.push(row("Apps", apps.map((a) => tile("icon", { bg: a.bg, dark: a.dark, glyph: a.ico, label: a.name, onclick: () => go(a.id) }))));
    res.replaceChildren(...(out.length ? out : [h("p", { class: "empty" }, `Nenhum resultado para “${query}”.`)]));
  }

  // ---------------------------------------------------------------- AJUSTES (duas colunas, como no tvOS)
  const OPTIONS = {
    theme: { label: "Aparência", icon: "◐", bg: G("#5e5ce6", "#1c1c1e"), hint: "Escolha entre o modo escuro e o modo claro.", values: [["dark", "Escuro"], ["light", "Claro"]] },
    accent: { label: "Cor de destaque", icon: "🎨", bg: G("#ff375f", "#5e5ce6"), hint: "Cor usada em barras de progresso e realces.", values: [["blue", "Azul"], ["green", "Verde"], ["orange", "Laranja"], ["pink", "Rosa"]] },
    scale: { label: "Tamanho do texto", icon: "Aa", bg: G("#0a84ff", "#003a7a"), hint: "Aumente o texto para ler com conforto do sofá.", values: [[0.9, "Pequeno"], [1, "Padrão"], [1.15, "Grande"]] },
    screensaver: { label: "Protetor de tela", icon: "🏜️", bg: G("#f2a65a", "#7fb1c8"), hint: "Sobrevoos aéreos aparecem após o tempo de inatividade escolhido.", values: [[30, "30 segundos"], [60, "1 minuto"], [300, "5 minutos"], [0, "Nunca"]] },
    sound: { label: "Cliques de navegação", icon: "🔊", bg: G("#30d158", "#0b5d2a"), hint: "Toque um clique sutil ao mover a seleção.", values: [[true, "Ativado"], [false, "Desativado"]] },
    name: { label: "Nome", icon: "📺", bg: G("#8e8e93", "#3a3a3c"), hint: "Como esta TV aparece na Central de Controle.", values: [["Sala de estar", "Sala de estar"], ["Quarto", "Quarto"], ["Escritório", "Escritório"], ["Cozinha", "Cozinha"]] },
  };
  const sideInfo = (icon, bg, hint) => { $("#settingsIcon").textContent = icon; $("#settingsIcon").style.background = bg; $("#settingsHint").textContent = hint; };
  screenInit.settings = () => {
    const list = Object.entries(OPTIONS).map(([key, o]) => {
      const cur = o.values.find(([v]) => v === state.settings[key]) || o.values[0];
      const b = h("button", { class: "focusable li", "data-fid": "set-" + key, onclick: () => cycleSetting(key) },
        h("div", { class: "grow" }, o.label), h("span", { class: "value" }, cur[1] + "  ›"));
      b.addEventListener("tvfocus", () => sideInfo(o.icon, o.bg, o.hint + " Use ⬅ ➡ ou Enter para alterar."));
      return b;
    });
    const reset = h("button", { class: "focusable li", "data-fid": "set-reset", onclick: resetAll }, h("div", { class: "grow" }, "Redefinir"), h("span", { class: "value" }, "›"));
    reset.addEventListener("tvfocus", () => sideInfo("↺", G("#ff453a", "#5c0a06"), "Apaga o progresso, a Minha lista e todas as preferências."));
    const about = h("div", { class: "li static" }, h("div", { class: "grow" }, "Sobre", h("small", {}, "Aurora TV OS 2.0 · Interface web para Smart TV")), h("span", { class: "value" }, "2.0"));
    $("#settings").replaceChildren(...list, reset, about);
    setWall(G("#8e8e93", "#1c1c1e"));
  };
  function cycleSetting(key, dir = 1) {
    const vals = OPTIONS[key].values;
    const i = vals.findIndex(([v]) => v === state.settings[key]);
    state.settings[key] = vals[(i + dir + vals.length) % vals.length][0];
    store.set("settings", state.settings);
    applySettings();
    screenInit.settings();
    focus($(`[data-fid="set-${key}"]`), { silent: true });
  }
  function resetAll() {
    state.settings = { ...DEFAULTS }; state.progress = {}; state.mylist = [];
    store.set("settings", state.settings); store.set("progress", {}); store.set("mylist", []);
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

  // ---------------------------------------------------------------- Central de Controle
  function openControlCenter() {
    if (state.overlay?.classList.contains("cc")) return closeOverlay();
    if (state.overlay) closeOverlay();
    const now = new Date();
    const t = TRACKS[music.idx];
    const ccItem = (ico, label, sub, fn) => h("button", { class: "focusable li", onclick: fn }, h("span", {}, ico), h("div", {}, label, h("small", {}, sub)));
    const panel = h("div", { class: "cc-panel" },
      h("div", { class: "cc-time" }, clockText()),
      h("div", { class: "cc-date" }, now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) + " · " + state.settings.name),
      h("div", { class: "cc-grid" },
        ccItem("⏻", "Repousar", "Protetor de tela", () => { closeOverlay(); $("#screensaver").classList.add("on"); }),
        ccItem(state.settings.theme === "dark" ? "☾" : "☀︎", "Aparência", state.settings.theme === "dark" ? "Escuro" : "Claro", () => { cycleSetting("theme"); closeOverlay(); openControlCenter(); }),
        ccItem(music.playing ? "❚❚" : "▶", t ? t.name : "Música", t ? t.artist : "Nada tocando", () => { setMusicPlaying(!music.playing); closeOverlay(); openControlCenter(); }),
        ccItem("🔍", "Buscar", "Filmes e canais", () => { closeOverlay(); go("search"); }),
        ccItem("👤", "Perfil", state.settings.name, () => { cycleSetting("name"); closeOverlay(); openControlCenter(); }),
        ccItem("⚙︎", "Ajustes", "Abrir", () => { closeOverlay(); go("settings"); }),
      ));
    const cc = h("div", { class: "cc" }, panel);
    openOverlay(cc);
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
    let action = KEYMAP[e.key] || CODEMAP[e.keyCode];
    if (wake()) { e.preventDefault(); return; }
    // Na busca, letras e números digitam (exceto atalhos que viram texto)
    if (state.screen === "search" && !state.overlay && /^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); return typeKey(e.key.toLowerCase()); }
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
      if (state.screen === "settings" && !state.overlay && (action === "left" || action === "right") && focused?.dataset.fid?.startsWith("set-") && focused.dataset.fid !== "set-reset") {
        tick(); return cycleSetting(focused.dataset.fid.slice(4), action === "right" ? 1 : -1);
      }
      return move(action);
    }
    if (action === "ok") { if (focused) { tick(2400); focused.click(); } return; }
    if (action === "back") return back();
    if (action === "cc") return openControlCenter();
    if (action === "playpause" && music.idx >= 0) return setMusicPlaying(!music.playing);
  });
  document.addEventListener("keyup", (e) => {
    if (KEYMAP[e.key] === "home" && homeDown && homeHeld < 6) home();
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
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", px * 12 + "deg"); el.style.setProperty("--rx", -py * 12 + "deg");
      el.style.setProperty("--gx", (px + 0.5) * 100 + "%"); el.style.setProperty("--gy", (py + 0.5) * 100 + "%");
    }
  });
  document.addEventListener("click", (e) => {
    wake();
    if (state.overlay && (e.target === state.overlay)) return back();
    if (state.screen === "player" && e.target.closest(".player")) playerKey("ok");
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === "music-toggle") setMusicPlaying(!music.playing);
    if (a === "music-next") playTrack(music.idx + 1);
    if (a === "music-prev") playTrack(music.idx - 1);
  });
  document.addEventListener("contextmenu", (e) => { e.preventDefault(); back(); });

  // ---------------------------------------------------------------- boot
  applySettings();
  show("home");
  setTimeout(() => $("#boot").classList.add("hide"), 1900);
})();
