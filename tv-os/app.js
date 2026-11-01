/* Aurora TV OS — interface de TV controlada por controle remoto (setas + Enter + Voltar). */
(() => {
  "use strict";

  // ---------------------------------------------------------------- utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
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
    { id: "m1", title: "Horizonte Vermelho", year: 2025, genre: "Ficção científica", rating: "14", dur: 7980, emoji: "🚀", bg: G("#ff4d6d", "#3a0ca3"), desc: "Uma tripulação perdida em Marte descobre um sinal que muda tudo o que sabemos sobre a origem da vida." },
    { id: "m2", title: "O Último Samba", year: 2024, genre: "Drama", rating: "12", dur: 6420, emoji: "🎺", bg: G("#f8961e", "#6a040f"), desc: "Um músico veterano do Rio de Janeiro reúne a antiga banda para uma última apresentação no Carnaval." },
    { id: "m3", title: "Floresta Viva", year: 2026, genre: "Documentário", rating: "L", dur: 5400, emoji: "🌳", bg: G("#2d6a4f", "#95d5b2"), desc: "Uma jornada pela Amazônia revelando espécies nunca antes filmadas." },
    { id: "m4", title: "Código Fantasma", year: 2025, genre: "Suspense", rating: "16", dur: 7200, emoji: "👻", bg: G("#212529", "#5b8cff"), desc: "Uma hacker descobre que a IA que ajudou a criar está apagando pessoas da internet — e da realidade." },
    { id: "m5", title: "Pequenos Gigantes", year: 2023, genre: "Animação", rating: "L", dur: 5700, emoji: "🐜", bg: G("#ffbe0b", "#fb5607"), desc: "Uma colônia de formigas precisa salvar o jardim antes da chegada do inverno." },
    { id: "m6", title: "Maré Alta", year: 2026, genre: "Ação", rating: "14", dur: 6900, emoji: "🌊", bg: G("#0077b6", "#00b4d8"), desc: "Uma equipe de resgate enfrenta a maior tempestade do século na costa brasileira." },
    { id: "m7", title: "Cozinha de Vó", year: 2024, genre: "Série · Culinária", rating: "L", dur: 2700, emoji: "🍲", bg: G("#bc6c25", "#fefae0"), desc: "Receitas de família de todo o Brasil, contadas por quem as preparou por gerações." },
    { id: "m8", title: "Noite Neon", year: 2025, genre: "Série · Policial", rating: "16", dur: 3300, emoji: "🌃", bg: G("#7209b7", "#f72585"), desc: "Dois detetives investigam crimes em uma metrópole que nunca dorme." },
    { id: "m9", title: "Galáxia Kids", year: 2026, genre: "Infantil", rating: "L", dur: 1500, emoji: "🪐", bg: G("#4361ee", "#4cc9f0"), desc: "Aventuras educativas pelo sistema solar com a robô Lila." },
    { id: "m10", title: "Rota 66", year: 2022, genre: "Comédia", rating: "12", dur: 6000, emoji: "🚗", bg: G("#e76f51", "#264653"), desc: "Três amigos, um carro velho e uma viagem que não sai nada como o planejado." },
  ];
  const CHANNELS = [
    { n: 2, name: "Aurora News", show: "Jornal da Tarde", next: "Esportes ao Vivo", hue: 210 },
    { n: 4, name: "Esporte+", show: "Futebol: Final do Campeonato", next: "Mesa Redonda", hue: 130 },
    { n: 5, name: "Cine Clássico", show: "Sessão da Tarde", next: "Grandes Diretores", hue: 30 },
    { n: 7, name: "Kids Planet", show: "Galáxia Kids", next: "Desenhos Animados", hue: 280 },
    { n: 9, name: "Natureza HD", show: "Oceanos Profundos", next: "Vida Selvagem", hue: 180 },
    { n: 11, name: "Música TV", show: "Top 20 da Semana", next: "Acústico", hue: 330 },
    { n: 13, name: "Gourmet", show: "Chef em Casa", next: "Desafio dos Doces", hue: 15 },
  ];
  const TRACKS = [
    { name: "Luz do Amanhã", artist: "Aurora Band", dur: 32, seed: 1 },
    { name: "Café com Chuva", artist: "Lofi Rio", dur: 28, seed: 2 },
    { name: "Ondas Digitais", artist: "Synth Paulista", dur: 30, seed: 3 },
    { name: "Estrada Azul", artist: "Mar & Serra", dur: 26, seed: 4 },
    { name: "Noite de São João", artist: "Forró Eletrônico", dur: 34, seed: 5 },
    { name: "Pixel Bossa", artist: "8-bit Brasil", dur: 30, seed: 6 },
  ];
  const PHOTOS = [
    ["🏖️", "Praia do Forte", G("#48cae4", "#ffd166")], ["🏔️", "Serra da Mantiqueira", G("#6c757d", "#adb5bd")],
    ["🌅", "Pôr do sol", G("#ff7b00", "#ff006e")], ["🐶", "Thor", G("#ddb892", "#7f5539")],
    ["🎂", "Aniversário", G("#ff99c8", "#a9def9")], ["🌵", "Chapada", G("#e9c46a", "#2a9d8f")],
    ["🏙️", "São Paulo", G("#343a40", "#5b8cff")], ["🎡", "Parque", G("#f72585", "#7209b7")],
    ["🌻", "Jardim", G("#ffd60a", "#588157")], ["⛵", "Veleiro", G("#00b4d8", "#03045e")],
  ];
  const APPS = [
    { id: "movies", name: "Filmes", ico: "🎬", bg: G("#e63946", "#9d0208") },
    { id: "live", name: "TV ao Vivo", ico: "📺", bg: G("#3a86ff", "#023e8a") },
    { id: "music", name: "Música", ico: "🎵", bg: G("#8338ec", "#3a0ca3") },
    { id: "photos", name: "Fotos", ico: "🖼️", bg: G("#06d6a0", "#118ab2") },
    { id: "weather", name: "Clima", ico: "⛅", bg: G("#ffbe0b", "#fb8500") },
    { id: "search", name: "Buscar", ico: "🔍", bg: G("#495057", "#212529") },
    { id: "settings", name: "Ajustes", ico: "⚙️", bg: G("#6c757d", "#343a40") },
  ];

  // ---------------------------------------------------------------- estado
  const state = {
    screen: "home",
    history: [],
    overlay: null,             // elemento modal que captura o foco
    progress: store.get("progress", {}), // id do filme -> segundos assistidos
    settings: Object.assign({ theme: "dark", accent: "blue", scale: 1, name: "Sala de estar", screensaver: 60, sound: true }, store.get("settings", {})),
  };

  // ---------------------------------------------------------------- som de navegação
  let actx;
  const audio = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
  const beep = (freq = 660, dur = 0.04, vol = 0.04) => {
    if (!state.settings.sound) return;
    try {
      const a = audio(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = freq; g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    } catch { /* áudio indisponível */ }
  };

  // ---------------------------------------------------------------- motor de foco (navegação espacial)
  let focused = null;
  const scope = () => state.overlay || $(`.screen[data-screen="${state.screen}"]`);
  const visibleFocusables = () => $$(".focusable", scope()).filter((el) => el.offsetParent !== null);

  function focus(el, { silent } = {}) {
    if (!el) return;
    focused?.classList.remove("focused");
    focused = el;
    el.classList.add("focused");
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    el.dispatchEvent(new CustomEvent("tvfocus"));
    if (!silent) beep();
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
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - cx, dy = by - cy;
      let main, cross;
      if (dir === "left") { if (b.right > r.left + 1) continue; main = -dx; cross = Math.abs(dy); }
      if (dir === "right") { if (b.left < r.right - 1) continue; main = dx; cross = Math.abs(dy); }
      if (dir === "up") { if (b.bottom > r.top + 1) continue; main = -dy; cross = Math.abs(dx); }
      if (dir === "down") { if (b.top < r.bottom - 1) continue; main = dy; cross = Math.abs(dx); }
      const score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) focus(best); else beep(220, 0.05);
  }

  // ---------------------------------------------------------------- navegação entre telas
  const screenInit = {};
  const screenLeave = {};

  function go(name, opts = {}) {
    if (name === state.screen && !opts.force) return;
    screenLeave[state.screen]?.();
    if (!opts.replace) state.history.push({ screen: state.screen, opts: state.opts, focusId: focused?.dataset.fid });
    show(name, opts);
  }
  function show(name, opts = {}) {
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
    state.screen = name;
    state.opts = opts;
    document.body.dataset.screen = name;
    screenInit[name]?.(opts);
    requestAnimationFrame(() => {
      const target = (name === "player" && $("#playPause")) || (opts.focusId && $(`[data-fid="${opts.focusId}"]`, scope())) || visibleFocusables()[0];
      focus(target, { silent: true });
    });
  }
  function back() {
    if (state.overlay) return closeOverlay();
    const prev = state.history.pop();
    if (!prev) return toast("Você já está no início");
    screenLeave[state.screen]?.();
    beep(440);
    show(prev.screen, { ...prev.opts, focusId: prev.focusId });
  }
  function home() {
    if (state.overlay) closeOverlay();
    if (state.screen === "home") return;
    screenLeave[state.screen]?.();
    state.history = [];
    show("home");
  }

  function openOverlay(el) {
    state.overlayReturn = focused;
    state.overlay = el;
    document.body.append(el);
    const f = visibleFocusables()[0];
    if (f) focus(f, { silent: true }); else { focused?.classList.remove("focused"); focused = null; }
  }
  function closeOverlay() {
    state.overlay?.remove();
    state.overlay = null;
    focus(state.overlayReturn, { silent: true });
  }

  // ---------------------------------------------------------------- componentes
  let fidN = 0;
  const fid = () => "f" + ++fidN;
  const row = (title, items) =>
    h("div", { class: "row" }, h("h3", {}, title), h("div", { class: "row-track" }, items));

  const appTile = (app) =>
    h("button", { class: "focusable app-tile", style: `background:${app.bg}`, "data-fid": "app-" + app.id, onclick: () => go(app.id) },
      h("span", { class: "ico" }, app.ico), app.name);

  function movieCard(m, wide = false) {
    const p = state.progress[m.id];
    const card = h("button", { class: `focusable card${wide ? " wide" : ""}`, style: `background:${m.bg}`, "data-fid": fid(), onclick: () => go("details", { movie: m }) },
      h("div", { class: "emoji" }, m.emoji),
      h("span", {}, m.title),
      p ? h("div", { class: "bar", style: `width:${Math.min(100, (p / m.dur) * 100)}%` }) : null);
    card.addEventListener("tvfocus", () => setHero(m));
    return card;
  }

  function setHero(m) {
    $("#hero").style.background = m.bg;
    $("#heroTag").textContent = `${m.genre} · ${m.year}`;
    $("#heroTitle").textContent = m.title;
    $("#heroDesc").textContent = m.desc;
  }

  // ---------------------------------------------------------------- HOME
  screenInit.home = () => {
    fidN = 0;
    const rows = $("#homeRows");
    rows.replaceChildren();
    rows.append(row("Aplicativos", APPS.map(appTile)));
    const cont = MOVIES.filter((m) => state.progress[m.id]);
    if (cont.length) rows.append(row("Continuar assistindo", cont.map((m) => movieCard(m, true))));
    rows.append(row("Recomendados para você", MOVIES.slice(0, 6).map((m) => movieCard(m))));
    rows.append(row("Lançamentos", MOVIES.filter((m) => m.year >= 2025).map((m) => movieCard(m, true))));
    const tiles = $$(".app-tile", rows);
    APPS.forEach((a, i) => tiles[i].addEventListener("tvfocus", () => {
      $("#hero").style.background = a.bg;
      $("#heroTag").textContent = "Aplicativo";
      $("#heroTitle").textContent = `${a.ico} ${a.name}`;
      $("#heroDesc").textContent = "Pressione Enter para abrir.";
    }));
  };

  // ---------------------------------------------------------------- FILMES
  screenInit.movies = () => {
    fidN = 100;
    const genres = {};
    MOVIES.forEach((m) => (genres[m.genre.split(" · ")[0]] ||= []).push(m));
    $("#movieRows").replaceChildren(
      row("Todos os títulos", MOVIES.map((m) => movieCard(m))),
      ...Object.entries(genres).map(([g, list]) => row(g, list.map((m) => movieCard(m, true)))),
    );
  };

  // ---------------------------------------------------------------- DETALHES
  screenInit.details = ({ movie: m } = {}) => {
    if (!m) return;
    const p = state.progress[m.id];
    const el = $("#details");
    el.style.background = m.bg;
    el.replaceChildren(
      h("div", { style: "font-size:5em" }, m.emoji),
      h("h1", {}, m.title),
      h("div", { class: "meta" }, h("b", {}, m.rating), h("span", {}, String(m.year)), h("span", {}, m.genre), h("span", {}, `${Math.round(m.dur / 60)} min`)),
      h("p", { style: "font-size:1.15em;line-height:1.5" }, m.desc),
      h("div", { class: "actions" },
        h("button", { class: "focusable btn primary", onclick: () => go("player", { movie: m, from: p || 0 }) }, p ? `▶ Continuar (${fmtTime(p)})` : "▶ Assistir"),
        p ? h("button", { class: "focusable btn", onclick: () => go("player", { movie: m, from: 0 }) }, "↺ Do início") : null,
        h("button", { class: "focusable btn", onclick: () => toast(`"${m.title}" adicionado à sua lista`) }, "＋ Minha lista"),
      ),
    );
  };

  // ---------------------------------------------------------------- PLAYER (vídeo gerado em canvas)
  const player = { raf: 0, playing: true, t: 0, movie: null, last: 0, idleTimer: 0 };
  screenInit.player = ({ movie, from = 0 } = {}) => {
    if (!movie) return;
    Object.assign(player, { movie, t: from, playing: true, last: performance.now() });
    $("#playerTitle").textContent = movie.title;
    $("#playPause").textContent = "⏸ Pausar";
    const canvas = $("#playerCanvas"), ctx = canvas.getContext("2d");
    const hue = [...movie.id].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;
    const loop = (now) => {
      const dt = (now - player.last) / 1000; player.last = now;
      if (player.playing) player.t = Math.min(movie.dur, player.t + dt);
      const w = (canvas.width = canvas.clientWidth), hgt = (canvas.height = canvas.clientHeight);
      const g = ctx.createLinearGradient(0, 0, w, hgt);
      g.addColorStop(0, `hsl(${(hue + player.t * 4) % 360} 70% 22%)`);
      g.addColorStop(1, `hsl(${(hue + 120 + player.t * 4) % 360} 70% 12%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
      for (let i = 0; i < 14; i++) {
        const x = w / 2 + Math.cos(player.t * 0.3 + i) * w * 0.35 * Math.sin(i * 1.7);
        const y = hgt / 2 + Math.sin(player.t * 0.4 + i * 2) * hgt * 0.3;
        ctx.beginPath(); ctx.arc(x, y, 30 + 25 * Math.sin(player.t + i), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${(hue + i * 25) % 360} 90% 65% / .25)`; ctx.fill();
      }
      ctx.font = `${Math.round(hgt / 5)}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(movie.emoji, w / 2, hgt / 2 + Math.sin(player.t) * 10);
      $("#playerProgress").style.width = `${(player.t / movie.dur) * 100}%`;
      $("#playerTime").textContent = `${fmtTime(player.t)} / ${fmtTime(movie.dur)}`;
      if (player.t >= movie.dur) { player.playing = false; $("#playPause").textContent = "▶ Reproduzir"; }
      player.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(player.raf);
    player.raf = requestAnimationFrame(loop);
    wakePlayerUI();
  };
  screenLeave.player = () => {
    cancelAnimationFrame(player.raf);
    if (player.movie) {
      if (player.t > 5 && player.t < player.movie.dur - 30) state.progress[player.movie.id] = Math.floor(player.t);
      else delete state.progress[player.movie.id];
      store.set("progress", state.progress);
    }
  };
  function wakePlayerUI() {
    const ui = $(".player-ui"); ui.classList.remove("idle");
    clearTimeout(player.idleTimer);
    player.idleTimer = setTimeout(() => state.screen === "player" && player.playing && ui.classList.add("idle"), 3500);
  }

  // ---------------------------------------------------------------- TV AO VIVO
  const live = { raf: 0, ch: 0 };
  screenInit.live = () => {
    const guide = $("#guide");
    guide.replaceChildren(...CHANNELS.map((c, i) => {
      const b = h("button", { class: "focusable channel", "data-fid": "ch" + i, onclick: () => tune(i) },
        h("span", { class: "num" }, String(c.n)),
        h("div", {}, h("b", {}, c.name), h("small", {}, `Agora: ${c.show}`), h("small", {}, `A seguir: ${c.next}`)),
        h("span", {}, "▶"));
      b.addEventListener("tvfocus", () => tune(i, true));
      return b;
    }));
    tune(live.ch, true);
    const canvas = $("#liveCanvas"), ctx = canvas.getContext("2d");
    const loop = (now) => {
      const c = CHANNELS[live.ch], t = now / 1000;
      const w = (canvas.width = canvas.clientWidth), hgt = (canvas.height = canvas.clientHeight);
      ctx.fillStyle = `hsl(${c.hue} 50% 15%)`; ctx.fillRect(0, 0, w, hgt);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `hsla(${c.hue + i * 12} 80% 55% / .35)`;
        const bw = w / 8;
        const bh = hgt * (0.3 + 0.25 * Math.sin(t * 1.5 + i));
        ctx.fillRect(i * bw + 4, hgt - bh, bw - 8, bh);
      }
      ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(hgt / 9)}px system-ui`; ctx.textAlign = "center";
      ctx.fillText(c.name, w / 2, hgt / 2.4);
      live.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(live.raf);
    live.raf = requestAnimationFrame(loop);
  };
  screenLeave.live = () => cancelAnimationFrame(live.raf);
  function tune(i, preview) {
    live.ch = i;
    const c = CHANNELS[i];
    $("#liveNow").innerHTML = `<b>${c.n} · ${c.name}</b><br>${c.show}`;
    $$(".channel").forEach((el, j) => el.classList.toggle("playing", j === i));
    if (!preview) {
      const m = { id: "live" + c.n, title: `${c.n} · ${c.name} — ${c.show}`, dur: 3600, emoji: "📡" };
      go("player", { movie: m, from: (Date.now() / 1000) % 3600 });
    }
  }

  // ---------------------------------------------------------------- MÚSICA (sintetizada com Web Audio)
  const music = { idx: -1, playing: false, timer: 0, step: 0, eqTimer: 0 };
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  screenInit.music = () => {
    const eq = $("#eq");
    if (!eq.children.length) for (let i = 0; i < 16; i++) eq.append(h("i"));
    $("#tracklist").replaceChildren(...TRACKS.map((t, i) => h("li", {},
      h("button", { class: "focusable track" + (i === music.idx ? " current" : ""), "data-fid": "tr" + i, onclick: () => playTrack(i) },
        h("span", {}, String(i + 1).padStart(2, "0")),
        h("div", {}, h("b", {}, t.name), h("br"), h("small", {}, t.artist)),
        h("small", {}, fmtTime(t.dur))))));
  };
  function playTrack(i) {
    music.idx = (i + TRACKS.length) % TRACKS.length;
    const t = TRACKS[music.idx];
    $("#trackName").textContent = t.name;
    $("#trackArtist").textContent = t.artist;
    $$(".track").forEach((el, j) => el.classList.toggle("current", j === music.idx));
    music.step = 0;
    setMusicPlaying(true);
  }
  function setMusicPlaying(on) {
    if (music.idx < 0) { if (on) playTrack(0); return; }
    music.playing = on;
    $("#musicToggle").textContent = on ? "⏸" : "▶";
    $("#disc").classList.toggle("spin", on);
    clearInterval(music.timer); clearInterval(music.eqTimer);
    if (!on) { $$("#eq i").forEach((b) => (b.style.height = "4px")); return; }
    const t = TRACKS[music.idx];
    const base = 196 * Math.pow(2, t.seed / 12);
    let rnd = t.seed * 9301;
    const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    const melody = Array.from({ length: 16 }, () => SCALE[Math.floor(rand() * SCALE.length)]);
    music.timer = setInterval(() => {
      const note = melody[music.step % melody.length];
      try {
        const a = audio(), o = a.createOscillator(), g = a.createGain();
        o.type = ["triangle", "sine", "square", "sawtooth"][t.seed % 4];
        o.frequency.value = base * Math.pow(2, note / 12);
        g.gain.value = 0.05; g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.3);
        o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.32);
      } catch { /* áudio indisponível */ }
      music.step++;
      if (music.step * 0.25 >= t.dur) playTrack(music.idx + 1);
    }, 250);
    music.eqTimer = setInterval(() => $$("#eq i").forEach((b) => (b.style.height = 4 + Math.random() * 36 + "px")), 120);
  }

  // ---------------------------------------------------------------- FOTOS
  screenInit.photos = () => {
    $("#photoGrid").replaceChildren(...PHOTOS.map(([e, name, bg], i) =>
      h("button", { class: "focusable photo", style: `background:${bg}`, "data-fid": "ph" + i, title: name, onclick: () => openPhoto(i) }, e)));
  };
  function openPhoto(i) {
    const render = (el) => {
      const [e, name, bg] = PHOTOS[i];
      el.style.background = bg;
      el.replaceChildren(e, h("small", {}, `${name} — ${i + 1}/${PHOTOS.length} · ⬅ ➡ para navegar`));
    };
    const box = h("div", { class: "lightbox" });
    box.onArrow = (dir) => {
      if (dir === "left" || dir === "right") { i = (i + (dir === "right" ? 1 : -1) + PHOTOS.length) % PHOTOS.length; render(box); beep(); }
      return true;
    };
    render(box);
    openOverlay(box);
  }

  // ---------------------------------------------------------------- CLIMA
  screenInit.weather = () => {
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const icons = ["☀️", "⛅", "🌧️", "⛈️", "🌤️", "☁️"];
    const today = new Date().getDay();
    $("#weather").replaceChildren(
      h("div", { class: "weather-now" },
        h("div", { class: "big" }, "☀️"),
        h("div", {}, h("div", { class: "temp" }, "26°"), h("div", {}, "São Paulo · Ensolarado"), h("small", { style: "color:var(--muted)" }, "Umidade 58% · Vento 12 km/h"))),
      h("div", { class: "forecast" }, Array.from({ length: 7 }, (_, i) => {
        const max = 24 + ((i * 7) % 6), min = max - 8;
        return h("button", { class: "focusable day", "data-fid": "d" + i, onclick: () => toast(`${days[(today + i) % 7]}: máx ${max}° / mín ${min}°`) },
          h("b", {}, i === 0 ? "Hoje" : days[(today + i) % 7]),
          h("span", { class: "ico" }, icons[(i * 5) % icons.length]),
          h("span", {}, `${max}°`), h("small", {}, `${min}°`));
      })),
    );
  };

  // ---------------------------------------------------------------- BUSCA (teclado virtual)
  let query = "";
  screenInit.search = () => {
    const kb = $("#keyboard");
    if (!kb.children.length) {
      const keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
      kb.append(...keys.map((k) => h("button", { class: "focusable key", "data-fid": "k" + k, onclick: () => typeKey(k) }, k)));
      kb.append(h("button", { class: "focusable key wide", "data-fid": "kspace", onclick: () => typeKey(" ") }, "Espaço"));
      kb.append(h("button", { class: "focusable key wide", "data-fid": "kdel", onclick: () => typeKey("DEL") }, "⌫ Apagar"));
      kb.append(h("button", { class: "focusable key wide", "data-fid": "kclr", onclick: () => typeKey("CLR") }, "Limpar"));
    }
    renderSearch();
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
    if (!q) return res.replaceChildren(h("p", { class: "empty" }, "Digite para buscar filmes, séries, canais e apps."));
    const movies = MOVIES.filter((m) => norm(m.title + " " + m.genre).includes(q));
    const apps = APPS.filter((a) => norm(a.name).includes(q));
    const chans = CHANNELS.filter((c) => norm(c.name + " " + c.show).includes(q));
    const out = [];
    if (apps.length) out.push(row("Aplicativos", apps.map(appTile)));
    if (movies.length) out.push(row("Filmes e séries", movies.map((m) => movieCard(m, true))));
    if (chans.length) out.push(row("Canais", chans.map((c) => h("button", { class: "focusable app-tile", style: `background:hsl(${c.hue} 60% 35%)`, "data-fid": fid(), onclick: () => { live.ch = CHANNELS.indexOf(c); go("live"); } }, h("span", { class: "ico" }, "📡"), `${c.n} · ${c.name}`))));
    res.replaceChildren(...(out.length ? out : [h("p", { class: "empty" }, `Nada encontrado para "${query}".`)]));
  }

  // ---------------------------------------------------------------- AJUSTES
  const OPTIONS = {
    theme: { label: "Tema", hint: "Aparência da interface", values: [["dark", "Escuro"], ["light", "Claro"]] },
    accent: { label: "Cor de destaque", hint: "Cor dos realces", values: [["blue", "Azul"], ["green", "Verde"], ["orange", "Laranja"], ["pink", "Rosa"]] },
    scale: { label: "Tamanho do texto", hint: "Para ler de longe", values: [[0.9, "Pequeno"], [1, "Normal"], [1.15, "Grande"]] },
    screensaver: { label: "Protetor de tela", hint: "Após inatividade", values: [[30, "30 s"], [60, "1 min"], [300, "5 min"], [0, "Desligado"]] },
    sound: { label: "Sons de navegação", hint: "Clique ao mover o foco", values: [[true, "Ligado"], [false, "Desligado"]] },
    name: { label: "Nome da TV", hint: "Exibido no topo", values: [["Sala de estar", "Sala de estar"], ["Quarto", "Quarto"], ["Escritório", "Escritório"], ["Cozinha", "Cozinha"]] },
  };
  screenInit.settings = () => {
    const list = Object.entries(OPTIONS).map(([key, o]) => {
      const cur = o.values.find(([v]) => v === state.settings[key]) || o.values[0];
      return h("button", { class: "focusable setting", "data-fid": "set-" + key, onclick: () => cycleSetting(key) },
        h("div", {}, h("b", {}, o.label), h("small", {}, o.hint)),
        h("span", { class: "value" }, `‹ ${cur[1]} ›`));
    });
    list.push(h("button", { class: "focusable setting", "data-fid": "set-reset", onclick: resetAll },
      h("div", {}, h("b", {}, "Restaurar padrões"), h("small", {}, "Apaga progresso e preferências")), h("span", { class: "value" }, "↺")));
    list.push(h("div", { class: "setting" }, h("div", {}, h("b", {}, "Sobre"), h("small", {}, "Aurora TV OS 1.0 · Interface web para Smart TV")), h("span", { class: "value" }, "v1.0")));
    $("#settings").replaceChildren(...list);
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
    state.settings = { theme: "dark", accent: "blue", scale: 1, name: "Sala de estar", screensaver: 60, sound: true };
    state.progress = {};
    store.set("settings", state.settings); store.set("progress", {});
    applySettings(); screenInit.settings();
    focus($('[data-fid="set-reset"]'), { silent: true });
    toast("Padrões restaurados");
  }
  function applySettings() {
    const s = state.settings, root = document.documentElement;
    root.dataset.theme = s.theme;
    root.dataset.accent = s.accent;
    root.style.setProperty("--scale", s.scale);
    $("#profileName").textContent = s.name;
    $("#avatar").textContent = s.name[0];
  }

  // ---------------------------------------------------------------- relógio e protetor de tela
  const clockText = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  setInterval(() => { $("#clock").textContent = clockText(); $("#ssClock").textContent = clockText(); }, 1000);
  $("#clock").textContent = clockText();

  let idleAt = Date.now();
  setInterval(() => {
    const limit = state.settings.screensaver;
    const busy = (state.screen === "player" && player.playing) || music.playing;
    if (limit && !busy && Date.now() - idleAt > limit * 1000) $("#screensaver").classList.add("on");
  }, 1000);
  setInterval(() => {
    const c = $("#ssClock");
    c.style.left = Math.random() * (innerWidth - 400) + "px";
    c.style.top = Math.random() * (innerHeight - 200) + "px";
  }, 4000);
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
    h: "home", H: "home", Home: "home",
    MediaPlayPause: "playpause", p: "playpause", P: "playpause",
  };
  // Teclas de controles de Smart TV (Tizen / webOS)
  const CODEMAP = { 10009: "back", 461: "back", 415: "playpause", 19: "playpause", 10252: "playpause" };

  document.addEventListener("keydown", (e) => {
    if ($("#boot") && !$("#boot").classList.contains("hide")) return;
    const action = KEYMAP[e.key] || CODEMAP[e.keyCode];
    if (wake()) { e.preventDefault(); return; }
    if (!action) {
      // Digitação direta na tela de busca
      if (state.screen === "search" && /^[a-z0-9]$/i.test(e.key)) typeKey(e.key.toUpperCase());
      return;
    }
    e.preventDefault();
    if (state.screen === "player") wakePlayerUI();

    if (["up", "down", "left", "right"].includes(action)) {
      if (state.overlay?.onArrow?.(action)) return;
      // Esquerda/direita alteram valores nas configurações
      if (state.screen === "settings" && (action === "left" || action === "right") && focused?.dataset.fid?.startsWith("set-") && focused.dataset.fid !== "set-reset") {
        beep(); return cycleSetting(focused.dataset.fid.slice(4), action === "right" ? 1 : -1);
      }
      return move(action);
    }
    if (action === "ok") { if (focused) { beep(880, 0.06); focused.click(); } return; }
    if (action === "back") return back();
    if (action === "home") return home();
    if (action === "playpause") {
      if (state.screen === "player") return $("#playPause").click();
      if (music.idx >= 0) return setMusicPlaying(!music.playing);
    }
  });

  // Mouse: passar o cursor foca, como um "air mouse" de TV
  document.addEventListener("mousemove", (e) => {
    wake();
    if (state.screen === "player") wakePlayerUI();
    const el = e.target.closest?.(".focusable");
    if (el && el !== focused && scope().contains(el)) focus(el, { silent: true });
  });
  document.addEventListener("click", (e) => { wake(); if (state.overlay && e.target === state.overlay) back(); });
  document.addEventListener("contextmenu", (e) => { e.preventDefault(); back(); });

  // Ações dos controles fixos (player e música)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === "toggle") {
      if (player.t >= player.movie.dur) player.t = 0;
      player.playing = !player.playing;
      btn.textContent = player.playing ? "⏸ Pausar" : "▶ Reproduzir";
      wakePlayerUI();
    }
    if (a === "seek") player.t = Math.max(0, Math.min(player.movie.dur, player.t + Number(btn.dataset.delta)));
    if (a === "music-toggle") setMusicPlaying(!music.playing);
    if (a === "music-next") playTrack(music.idx + 1);
    if (a === "music-prev") playTrack(music.idx - 1);
  });

  // ---------------------------------------------------------------- boot
  applySettings();
  show("home");
  setTimeout(() => { $("#boot").classList.add("hide"); toast(`Olá! ${state.settings.name} pronta.`); }, 2000);
})();
