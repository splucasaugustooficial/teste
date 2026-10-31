(function () {
  "use strict";

  const Eng = window.CobraEngine;
  const Net = window.CobraNet;
  const audio = window.CobraAudio.createAudio();

  const canvas = document.getElementById("game");
  const renderer = window.CobraRender.createRenderer(canvas);
  const kb = window.CobraInput.createKeyboard();
  const stick1 = window.CobraInput.createStick(document.getElementById("pad1"));
  const stick2 = window.CobraInput.createStick(document.getElementById("pad2"));
  const boost1 = window.CobraInput.createBoost(document.getElementById("boost1"));
  const boost2 = window.CobraInput.createBoost(document.getElementById("boost2"));

  const ui = {
    menu: document.getElementById("menu"),
    lobby: document.getElementById("lobby"),
    result: document.getElementById("result"),
    name: document.getElementById("player-name"),
    hud: document.getElementById("hud"),
    score: document.getElementById("hud-score"),
    board: document.getElementById("hud-board"),
    timer: document.getElementById("hud-timer"),
    mode: document.getElementById("hud-mode"),
    feed: document.getElementById("killfeed"),
    toast: document.getElementById("toast"),
    lobbyStatus: document.getElementById("lobby-status"),
    lobbyList: document.getElementById("lobby-list"),
    lobbyIp: document.getElementById("lobby-ip"),
    startBtn: document.getElementById("btn-start-match"),
    resultTitle: document.getElementById("result-title"),
    resultBody: document.getElementById("result-body"),
    who2: document.getElementById("who2"),
    pad2: document.getElementById("pad2"),
    boost2: document.getElementById("boost2"),
  };

  const savedName = localStorage.getItem("cobra-name") || "";
  if (savedName) ui.name.value = savedName;

  let mode = "contra";
  let place = "solo";
  let game = null;
  let running = false;
  let last = 0;
  let acc = 0;
  let localIds = [0];
  let followIds = new Set([0]);
  let host = false;
  let myPeerId = "self";
  let peers = new Map();
  let lobbyPlayers = [];
  let seed = 1;
  let endedOnce = false;

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      ui.toast.style.display = "none";
    }, 2400);
  }

  function show(el) {
    ui.menu.classList.add("hidden");
    ui.lobby.classList.add("hidden");
    ui.result.classList.add("hidden");
    if (el) el.classList.remove("hidden");
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll(".mode").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.mode === next);
    });
  }

  document.querySelectorAll(".mode").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  function playerName() {
    const n = (ui.name.value || "").trim() || "Cobra";
    localStorage.setItem("cobra-name", n);
    return n.slice(0, 14);
  }

  function twoLocal() {
    return place === "device" && (mode === "dupla" || mode === "contra");
  }

  function setupPads() {
    const split = twoLocal();
    ui.pad2.style.display = split ? "block" : "none";
    ui.boost2.style.display = split ? "grid" : "none";
    ui.who2.style.display = split ? "block" : "none";
    document.getElementById("boost1").classList.toggle("p1", true);
  }

  function localInputs() {
    const p1 = window.CobraInput.merge(stick1, boost1, kb.p1());
    const out = {};
    if (game) {
      const a = game.snakes[localIds[0]];
      out[localIds[0]] = {
        dir: p1.active || p1.dir != null ? p1.dir : a ? a.dir : 0,
        boost: p1.boost,
      };
      if (localIds[1] != null) {
        const p2 = window.CobraInput.merge(stick2, boost2, kb.p2());
        const b = game.snakes[localIds[1]];
        out[localIds[1]] = {
          dir: p2.active || p2.dir != null ? p2.dir : b ? b.dir : 0,
          boost: p2.boost,
        };
      }
    }
    return out;
  }

  function humanPlayers() {
    if (place === "solo") return [{ name: playerName(), color: 1 }];
    if (place === "device") {
      if (mode === "dupla" || mode === "contra") {
        return [
          { name: playerName(), color: 1 },
          { name: "Jogador 2", color: 2 },
        ];
      }
    }
    return lobbyPlayers.map((p, i) => ({ name: p.name, color: i }));
  }

  function startLocal(overridePlayers) {
    seed = (Math.random() * 1e9) | 0;
    const players = overridePlayers || humanPlayers();
    game = Eng.createGame({ mode, seed, players });
    localIds = players.map((_, i) => i);
    followIds = new Set(localIds);
    running = true;
    endedOnce = false;
    last = performance.now();
    acc = 0;
    setupPads();
    show(null);
    ui.hud.style.display = "block";
    ui.mode.textContent = mode === "dupla" ? "DUPLA" : "CONTRA";
    audio.start();
  }

  function renderLobby() {
    ui.lobbyList.innerHTML = lobbyPlayers
      .map((p) => {
        const you = p.self ? ' <span class="you">você</span>' : "";
        const hostMark = p.host ? " · anfitrião" : "";
        return "<li><span>" + escapeHtml(p.name) + you + '</span><span>' + (p.ready ? "pronto" : "na sala") + hostMark + "</span></li>";
      })
      .join("");
    ui.startBtn.style.display = host ? "block" : "none";
    ui.startBtn.disabled = lobbyPlayers.length < 1;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function openLobby(meta) {
    show(ui.lobby);
    const ip = meta.hostIp || Net.localIp() || "rede local";
    if (meta.role === "host") {
      host = true;
      myPeerId = "self";
      ui.lobbyStatus.textContent = "Você é o primeiro na rede. Sala aberta.";
      ui.lobbyIp.textContent = "Peça para os outros abrirem o app na mesma Wi‑Fi. IP " + ip;
      lobbyPlayers = [{ id: "self", name: playerName(), host: true, self: true, ready: true }];
    } else if (meta.role === "offline") {
      host = true;
      ui.lobbyStatus.textContent = "Sem servidor de rede neste navegador. Abrindo partida local.";
      ui.lobbyIp.textContent = "No APK, o primeiro aparelho vira anfitrião automaticamente.";
      toast("Rede indisponível no browser — jogue no APK para LAN");
      place = "device";
      startLocal();
      return;
    } else {
      host = false;
      ui.lobbyStatus.textContent = "Entrando na sala do primeiro da rede.";
      ui.lobbyIp.textContent = "Conectado em " + ip;
      lobbyPlayers = [{ id: "self", name: playerName(), self: true, ready: true }];
    }
    renderLobby();
    Net.send({ t: "hello", name: playerName(), mode });
  }

  async function playNetwork() {
    place = "rede";
    show(ui.lobby);
    ui.lobbyStatus.textContent = "Procurando quem já está na rede…";
    ui.lobbyIp.textContent = "Se ninguém responder, você vira o anfitrião.";
    ui.lobbyList.innerHTML = "";
    const meta = await Net.becomeOrJoin({ name: playerName(), mode, scanMs: 1400 });
    openLobby(meta);
  }

  document.getElementById("btn-solo").addEventListener("click", () => {
    audio.unlock();
    place = "solo";
    startLocal();
  });
  document.getElementById("btn-device").addEventListener("click", () => {
    audio.unlock();
    place = "device";
    startLocal();
  });
  document.getElementById("btn-net").addEventListener("click", () => {
    audio.unlock();
    playNetwork();
  });
  document.getElementById("btn-back-menu").addEventListener("click", () => {
    Net.stop();
    running = false;
    show(ui.menu);
  });
  ui.startBtn.addEventListener("click", () => {
    if (!host) return;
    seed = (Math.random() * 1e9) | 0;
    const players = lobbyPlayers.map((p) => ({ name: p.name, netId: p.id, self: !!p.self }));
    Net.send({ t: "start", seed, mode, players });
    beginNetMatch(players, seed, true);
  });
  document.getElementById("btn-again").addEventListener("click", () => {
    show(ui.menu);
    ui.hud.style.display = "none";
  });

  function beginNetMatch(players, matchSeed, isHost) {
    host = isHost;
    game = Eng.createGame({ mode, seed: matchSeed, players });
    const idx = players.findIndex((p) => p.netId === myPeerId || (isHost && (p.netId === "self" || p.self)));
    localIds = [Math.max(0, idx)];
    followIds = new Set(localIds);
    running = true;
    endedOnce = false;
    last = performance.now();
    acc = 0;
    place = "rede";
    setupPads();
    show(null);
    ui.hud.style.display = "block";
    ui.mode.textContent = mode === "dupla" ? "DUPLA · REDE" : "CONTRA · REDE";
    audio.start();
  }

  const peerToSnake = new Map();

  Net.on("you", (msg) => {
    if (msg && msg.id) myPeerId = msg.id;
    if (msg && msg.role) host = msg.role === "host";
  });

  Net.on("client", (p) => {
    peers.set(p.id, { id: p.id, name: "Cobra" });
  });

  Net.on("disconnect", (p) => {
    lobbyPlayers = lobbyPlayers.filter((x) => x.id !== p.id);
    renderLobby();
  });

  Net.on("message", ({ id, msg }) => {
    if (!msg || !msg.t) return;
    if (msg.t === "hello") {
      if (host) {
        const already = lobbyPlayers.some((p) => p.id === id);
        if (!already) lobbyPlayers.push({ id, name: msg.name || "Cobra", ready: true });
        renderLobby();
        Net.send({ t: "welcome", id: id, mode: mode }, id);
        Net.send({
          t: "lobby",
          players: lobbyPlayers.map((p) => ({ id: p.id, name: p.name, host: !!p.host })),
          mode,
        });
      }
    }
    if (msg.t === "welcome") {
      myPeerId = msg.id || myPeerId;
      if (msg.mode) mode = msg.mode;
    }
    if (msg.t === "lobby") {
      lobbyPlayers = (msg.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        host: p.host,
        self: p.id === myPeerId || (p.host && host),
        ready: true,
      }));
      if (!lobbyPlayers.some((p) => p.self)) {
        lobbyPlayers.push({ id: myPeerId || "self", name: playerName(), self: true, ready: true });
      }
      if (msg.mode) mode = msg.mode;
      renderLobby();
    }
    if (msg.t === "start" && !host) {
      beginNetMatch(msg.players, msg.seed, false);
      msg.players.forEach((p, i) => peerToSnake.set(p.netId || p.id, i));
    }
    if (msg.t === "input" && host && game && running) {
      const idx = lobbyPlayers.findIndex((p) => p.id === id);
      if (idx >= 0) pendingInputs[idx] = { dir: msg.dir, boost: !!msg.boost };
    }
    if (msg.t === "state" && !host && game) {
      Eng.applySnapshot(game, msg.state);
      handleEvents(game.events);
    }
  });

  const pendingInputs = {};

  function pushFeed(text) {
    const el = document.createElement("span");
    el.textContent = text;
    ui.feed.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function handleEvents(events) {
    for (const ev of events || []) {
      if (ev.kind === "kill") {
        const k = game.snakes[ev.killer];
        const v = game.snakes[ev.victim];
        pushFeed((k ? k.name : "?") + " derrubou " + (v ? v.name : "?"));
        audio.kill();
        if (followIds.has(ev.victim)) renderer.bump();
      } else if (ev.kind === "die" && followIds.has(ev.victim)) {
        audio.die();
        renderer.bump();
      } else if (ev.kind === "end") {
        finish();
      }
    }
  }

  function finish() {
    if (endedOnce) return;
    endedOnce = true;
    running = false;
    const board = Eng.teamScores(game);
    const top = board[0];
    const title = mode === "dupla" ? "Equipe vencedora" : "Venceu";
    ui.resultTitle.textContent = top ? title : "Fim de jogo";
    ui.resultBody.innerHTML =
      (top
        ? "<p><b>" +
          escapeHtml((top.names || []).join(" + ") || "Time " + top.team) +
          "</b> · " +
          top.score +
          " pts · " +
          top.kills +
          " abates</p>"
        : "") +
      "<ol>" +
      board
        .slice(0, 6)
        .map((row) => "<li>" + escapeHtml((row.names || []).join(" + ") || "Time " + row.team) + " — " + row.score + "</li>")
        .join("") +
      "</ol>";
    show(ui.result);
    audio.win();
    Net.stop();
  }

  function fmtTime(sec) {
    const left = Math.max(0, Math.ceil(sec));
    const m = Math.floor(left / 60);
    const s = left % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function updateHud() {
    if (!game) return;
    const mine = game.snakes[localIds[0]];
    const extra = localIds[1] != null ? game.snakes[localIds[1]] : null;
    let score = mine ? mine.score : 0;
    if (extra) score += extra.score;
    if (mode === "dupla" && mine) {
      const mates = game.snakes.filter((s) => s.team === mine.team);
      score = mates.reduce((a, s) => a + s.score, 0);
    }
    ui.score.innerHTML = "<b>" + score + "</b> pts";
    ui.timer.textContent = fmtTime(game.matchSec - game.time);
    const board = Eng.teamScores(game).slice(0, 5);
    ui.board.innerHTML =
      "<h4>Placar</h4><ol>" +
      board
        .map((row) => {
          const label = mode === "dupla" ? (row.names || []).join(" + ") || "Time " + row.team : (row.names || [])[0] || "Cobra";
          return "<li>" + escapeHtml(label) + " · " + row.score + "</li>";
        })
        .join("") +
      "</ol>";
  }

  let sendAcc = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.08) dt = 0.08;
    renderer.resize();
    if (!running || !game) return;
    acc += dt;
    sendAcc += dt;
    const step = 1 / 20;
    const inputs = localInputs();
    if (place === "rede" && !host) {
      if (sendAcc > 0.05) {
        sendAcc = 0;
        const mine = inputs[localIds[0]];
        if (mine) Net.send({ t: "input", dir: mine.dir, boost: mine.boost });
      }
    }
    while (acc >= step) {
      acc -= step;
      if (place !== "rede" || host) {
        const merged = Object.assign({}, pendingInputs, inputs);
        if (place === "rede" && host) {
          for (const id of Object.keys(pendingInputs)) delete pendingInputs[id];
        }
        Eng.step(game, merged, step);
        if (place === "rede" && host) {
          Net.send({ t: "state", state: Eng.snapshot(game) });
        }
        handleEvents(game.events);
      }
    }
    renderer.frame(game, followIds, dt);
    updateHud();
    if (game.over) finish();
  }
  requestAnimationFrame(tick);

  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
  setMode("contra");
  show(ui.menu);
})();
