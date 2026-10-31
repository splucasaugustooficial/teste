"use strict";

(function () {
  var Sim = window.SnakeSim;
  var Session = window.SnakeSession;
  var Render = window.SnakeRender;
  var audio = window.SnakeAudio;
  var native = typeof AndroidBridge !== "undefined";

  var screen = "home";
  var session = null;
  var matchKind = "treino";
  var netRole = "offline";
  var rooms = [];
  var backdrop = null;
  var cameras = {};
  var aims = {};
  var keys = {};
  var boostHeld = [false, false];
  var best = 0;
  var lastFrame = 0;
  var lastSend = 0;
  var hudStamp = 0;
  var resultShown = false;
  var blown = false;
  var toastTimer = 0;
  var localMode = "dupla";
  var hostInfo = { ip: "", port: 0, wifi: true };
  var pointers = {};

  var viewCanvas = document.getElementById("view");
  var mapCanvas = document.getElementById("minimap");
  var hud = document.getElementById("hud");
  var nameInput = document.getElementById("name");
  var name2Input = document.getElementById("name2");
  var lobbyList = document.getElementById("lobby-list");
  var lobbyIp = document.getElementById("lobby-ip");
  var lobbyNote = document.getElementById("lobby-note");
  var lobbyWarn = document.getElementById("lobby-warn");
  var lobbyTitle = document.getElementById("lobby-title");
  var lobbyStart = document.getElementById("lobby-start");
  var lobBots = document.getElementById("lob-bots");
  var joinList = document.getElementById("join-list");
  var joinIp = document.getElementById("join-ip");
  var joinStatus = document.getElementById("join-status");
  var timerEl = document.getElementById("timer");
  var sizeEl = document.getElementById("me-size");
  var partnerEl = document.getElementById("me-partner");
  var totalsEl = document.getElementById("pair-totals");
  var boardEl = document.getElementById("board");
  var deathEl = document.getElementById("death");
  var resultEl = document.getElementById("result");
  var muteBtn = document.getElementById("mute");
  var boostBtn = document.getElementById("boost");
  var boost2Btn = document.getElementById("boost2");
  var leaveModal = document.getElementById("leave-modal");
  var leaveCopy = document.getElementById("leave-copy");
  var toastEl = document.getElementById("toast");
  var mapWrap = document.getElementById("minimap-wrap");
  var divider = document.getElementById("divider");
  var sideLeft = document.getElementById("side-left");
  var sideRight = document.getElementById("side-right");

  function $(id) { return document.getElementById(id); }

  function empty(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function nativeCommand(obj) {
    if (!native) return;
    AndroidBridge.command(JSON.stringify(obj));
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3600);
  }

  function persist() {
    var data = {
      name: nameInput.value.trim(),
      mute: !!audio.muted,
      best: best | 0,
    };
    try { localStorage.setItem("snake-livre", JSON.stringify(data)); } catch (err) { /* arquivo local pode bloquear */ }
    if (native) nativeCommand({ op: "savePrefs", name: data.name, mute: data.mute, best: data.best });
  }

  function loadLocalPrefs() {
    try {
      var raw = localStorage.getItem("snake-livre");
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.name) nameInput.value = String(data.name).slice(0, 16);
      if (data && typeof data.mute === "boolean") audio.muted = data.mute;
      if (data && typeof data.best === "number") best = data.best;
    } catch (err) { /* segue sem preferência salva */ }
    updateMute();
  }

  function updateMute() {
    muteBtn.textContent = audio.muted ? "Som off" : "Som on";
    muteBtn.setAttribute("aria-pressed", audio.muted ? "true" : "false");
  }

  function readName() {
    var name = Session.cleanName(nameInput.value);
    if (nameInput.value.trim()) nameInput.value = name;
    return name;
  }

  function show(name) {
    screen = name;
    var nodes = document.querySelectorAll(".screen");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("on", nodes[i].id === "screen-" + name);
    }
    var playing = name === "play";
    hud.hidden = !playing;
    if (!playing) {
      resultEl.hidden = true;
      deathEl.hidden = true;
    }
    if (name === "home" || name === "help" || name === "local" || name === "join" || name === "lobby") {
      ensureBackdrop();
    }
  }

  function ensureBackdrop() {
    if (backdrop && backdrop.phase === "playing") return;
    backdrop = Sim.createMatch({
      seed: (Date.now() ^ 0x9e3779b9) >>> 0,
      mode: "contra",
      players: [],
      fillBots: true,
      botTarget: 7,
      endless: true,
    });
  }

  function deliver(outs) {
    if (!outs || !native || netRole !== "host") return;
    for (var i = 0; i < outs.length; i++) {
      var data = JSON.stringify(outs[i].msg);
      if (outs[i].to === "*") nativeCommand({ op: "broadcast", data: data });
      else nativeCommand({ op: "send", to: outs[i].to, data: data });
    }
  }

  function pushAds() {
    if (!native || netRole !== "host" || !session) return;
    var hostName = "Sala";
    for (var i = 0; i < session.players.length; i++) {
      if (session.players[i].id === session.youId) hostName = session.players[i].name;
    }
    nativeCommand({
      op: "advertise",
      name: hostName,
      mode: session.mode,
      players: session.players.length,
      max: Sim.CONFIG.maxSnakes,
    });
  }

  function clearMatchInput() {
    aims = {};
    cameras = {};
    boostHeld = [false, false];
    boostBtn.classList.remove("held");
    boost2Btn.classList.remove("held");
    resultShown = false;
  }

  function startTreino() {
    var name = readName();
    nameInput.value = name;
    persist();
    session = Session.createHostSession({ name: name, mode: "contra", fillBots: true, endless: true });
    matchKind = "treino";
    netRole = "offline";
    Session.hostStart(session);
    clearMatchInput();
    show("play");
  }

  function createRoom() {
    var name = readName();
    nameInput.value = name;
    persist();
    session = Session.createHostSession({ name: name, mode: "contra", fillBots: true, endless: false });
    matchKind = "net";
    netRole = native ? "host" : "offline";
    hostInfo = { ip: "", port: 0, wifi: true };
    if (native) {
      nativeCommand({ op: "stop" });
      nativeCommand({
        op: "host",
        name: name,
        mode: session.mode,
        players: 1,
        max: Sim.CONFIG.maxSnakes,
      });
    }
    show("lobby");
    renderLobby();
  }

  function openLocal() {
    show("local");
    setModeButtons("local-modes", localMode);
  }

  function startLocal() {
    var name = readName();
    nameInput.value = name;
    var second = Session.cleanName(name2Input.value);
    name2Input.value = second;
    persist();
    session = Session.createHostSession({
      name: name,
      mode: localMode,
      fillBots: $("loc-bots").checked,
      endless: false,
    });
    Session.hostAddLocal(session, second);
    matchKind = "local";
    netRole = "offline";
    Session.hostStart(session);
    clearMatchInput();
    show("play");
  }

  function openJoin() {
    rooms = [];
    show("join");
    renderRooms();
    if (!native) {
      joinStatus.textContent = "A busca na rede funciona no aplicativo Android. Os dois celulares precisam do APK e da mesma Wi-Fi.";
      return;
    }
    joinStatus.textContent = "Procurando salas na Wi-Fi…";
    nativeCommand({ op: "stop" });
    nativeCommand({ op: "discover" });
  }

  function parseAddress(text) {
    var match = String(text || "").trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/);
    if (!match) return null;
    var parts = match[1].split(".");
    for (var i = 0; i < parts.length; i++) {
      if (Number(parts[i]) > 255) return null;
    }
    var port = match[2] ? Number(match[2]) : 47655;
    if (port < 1 || port > 65535) return null;
    return { ip: match[1], port: port };
  }

  function joinAddress(ip, port) {
    if (!native) {
      showToast("Entrar na rede só funciona no aplicativo, com os dois na mesma Wi-Fi.");
      return;
    }
    var name = readName();
    nameInput.value = name;
    persist();
    session = Session.createClientSession({ name: name });
    matchKind = "net";
    netRole = "client";
    nativeCommand({ op: "stop" });
    nativeCommand({ op: "join", ip: ip, port: port });
    showToast("Conectando em " + ip + ":" + port + "…");
  }

  function leaveMatch() {
    leaveModal.hidden = true;
    if (session && session.role === "host" && native && netRole === "host") {
      deliver([{ to: "*", msg: { t: "bye", reason: "O anfitrião encerrou a sala." } }]);
    }
    if (native) nativeCommand({ op: "stop" });
    session = null;
    netRole = "offline";
    resultShown = false;
    show("home");
  }

  function showLeave() {
    var hosting = session && session.role === "host" && netRole === "host";
    leaveCopy.textContent = hosting
      ? "Sair fecha a sala para todo mundo que entrou."
      : "Você volta ao menu. Dá para entrar de novo.";
    leaveModal.hidden = false;
  }

  function goBack() {
    if (!leaveModal.hidden) {
      leaveModal.hidden = true;
      return true;
    }
    if (screen === "play") {
      showLeave();
      return true;
    }
    if (screen !== "home") {
      if (native) nativeCommand({ op: "stop" });
      session = null;
      netRole = "offline";
      show("home");
      return true;
    }
    return false;
  }
  window.__snakeBack = goBack;

  function setModeButtons(groupId, mode) {
    var buttons = document.querySelectorAll("#" + groupId + " .mode");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("selected", buttons[i].getAttribute("data-mode") === mode);
    }
  }

  function lobbyRows() {
    if (!session) return [];
    if (session.role === "host") return Session.lobbyPlayers(session);
    return session.players || [];
  }

  function renderLobby() {
    if (!session) return;
    var host = session.role === "host";
    lobbyTitle.textContent = host ? "Sua sala" : "Sala";
    $("lob-contra").disabled = !host;
    $("lob-dupla").disabled = !host;
    lobBots.disabled = !host;
    lobBots.checked = !!session.fillBots;
    setModeButtons("screen-lobby", session.mode);
    lobbyStart.hidden = !host;
    if (host && native) {
      lobbyIp.textContent = hostInfo.ip ? hostInfo.ip + ":" + (hostInfo.port || 47655) : "Abrindo a sala…";
    } else if (host) {
      lobbyIp.textContent = "Só neste aparelho";
    } else {
      lobbyIp.textContent = session.mode === "dupla" ? "Dupla" : "Contra";
    }
    lobbyWarn.hidden = !(native && host && hostInfo.wifi === false);
    lobbyWarn.textContent = "Não detectei Wi-Fi. Se o outro celular não achar a sala, confira a rede e digite o IP.";
    var note = session.mode === "dupla"
      ? "Dupla: a ordem faz os pares (1º com 2º, 3º com 4º). A cobra do seu par não te mata. No fim, ganha o par maior."
      : "Contra: todo mundo é inimigo. Ganha a maior cobra quando o tempo acabar.";
    if (session.fillBots) note += " Bots completam a arena até 6 cobras.";
    if (host && !native) note += " No navegador a sala não aparece para outros celulares — use o APK na mesma Wi-Fi.";
    if (host && native) note += " O outro celular toca em Entrar na sala, na mesma Wi-Fi.";
    lobbyNote.textContent = note;

    empty(lobbyList);
    var rows = lobbyRows();
    if (session.mode === "dupla") {
      var groups = {};
      rows.forEach(function (player, index) {
        var key = String(player.pair || 1);
        if (!groups[key]) groups[key] = { label: player.pairLabel || key, color: player.color, items: [] };
        groups[key].items.push({ player: player, index: index });
      });
      Object.keys(groups).sort().forEach(function (key) {
        var title = document.createElement("h3");
        title.className = "pair-label";
        title.textContent = "Par " + groups[key].label;
        title.style.color = Sim.safeColor(groups[key].color);
        lobbyList.appendChild(title);
        groups[key].items.forEach(function (item) {
          lobbyList.appendChild(playerRow(item.player, item.index, rows.length, host));
        });
      });
    } else {
      rows.forEach(function (player, index) {
        lobbyList.appendChild(playerRow(player, index, rows.length, host));
      });
    }
  }

  function playerRow(player, index, total, host) {
    var row = document.createElement("div");
    row.className = "player";
    var dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = Sim.safeColor(player.color);
    var name = document.createElement("span");
    name.className = "grow";
    var label = player.name || "Jogador";
    if (player.id === session.youId) label += " (você)";
    if (player.host) label += " · anfitrião";
    name.textContent = label;
    row.appendChild(dot);
    row.appendChild(name);
    if (host && session.mode === "dupla") {
      row.appendChild(moveButton("↑", index === 0, function () { movePlayer(player.id, -1); }));
      row.appendChild(moveButton("↓", index === total - 1, function () { movePlayer(player.id, 1); }));
    }
    return row;
  }

  function moveButton(text, disabled, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "mini";
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function movePlayer(id, dir) {
    deliver(Session.hostMove(session, id, dir));
    renderLobby();
    pushAds();
  }

  function renderRooms() {
    empty(joinList);
    if (!rooms.length) {
      var blank = document.createElement("p");
      blank.className = "fine";
      blank.textContent = native ? "Nenhuma sala ainda. Peça o IP se ela não aparecer." : "";
      joinList.appendChild(blank);
      return;
    }
    rooms.forEach(function (room) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "room";
      var mode = room.mode === "dupla" ? "Dupla" : "Contra";
      button.textContent = (room.name || "Sala") + " · " + mode + " · " + (room.players || 1) + "/" + (room.max || 8);
      button.addEventListener("click", function () {
        joinAddress(room.ip, room.port || 47655);
      });
      joinList.appendChild(button);
    });
  }

  function failNet(message, stay) {
    showToast(message || "A conexão caiu.");
    if (native) nativeCommand({ op: "stop" });
    session = null;
    netRole = "offline";
    if (stay) {
      show("join");
      if (native) nativeCommand({ op: "discover" });
      return;
    }
    show("home");
  }

  function onClientPacket(msg) {
    if (!session || session.role !== "client") return;
    if (msg.t === "fx") {
      if (msg.id !== session.youId) return;
      if (msg.kind === "eat") audio.eat();
      if (msg.kind === "die") audio.die();
      return;
    }
    if (msg.t === "bye" || msg.t === "full" || msg.t === "busy") {
      Session.clientReceive(session, msg);
      var reason = session.error;
      var stay = msg.t !== "bye" && screen !== "play";
      failNet(reason, stay);
      return;
    }
    Session.clientReceive(session, msg);
    syncPhase();
  }

  function syncPhase() {
    if (!session) return;
    if (session.phase === "error") {
      failNet(session.error, screen === "join");
      return;
    }
    if (session.phase === "playing" && screen !== "play") {
      clearMatchInput();
      show("play");
      return;
    }
    if (session.phase === "lobby" && (screen === "play" || screen === "join" || screen === "home")) {
      resultShown = false;
      show("lobby");
      renderLobby();
      return;
    }
    if (session.phase === "lobby" && screen === "lobby") renderLobby();
    if (session.phase === "over" && screen === "play") openResult();
  }

  function openResult() {
    if (resultShown) return;
    var winner = session.result || (session.world && session.world.winner) || (session.snapshot && session.snapshot.winner);
    if (!winner && session.phase !== "over") return;
    resultShown = true;
    audio.win();
    var title = $("result-title");
    var sub = $("result-sub");
    var kicker = $("result-kicker");
    if (!winner) {
      title.textContent = "Fim de jogo";
      sub.textContent = "";
    } else if (winner.tie) {
      kicker.textContent = "empate";
      title.textContent = "Empate";
      sub.textContent = "O tamanho ficou igual.";
    } else if (winner.kind === "pair") {
      kicker.textContent = "dupla";
      title.textContent = winner.title;
      sub.textContent = "Par com " + winner.length + " de tamanho.";
    } else {
      kicker.textContent = "contra";
      title.textContent = winner.title + " venceu";
      sub.textContent = "Tamanho " + winner.length + ".";
    }
    var pairs = $("result-pairs");
    empty(pairs);
    if (winner && winner.pairs) {
      winner.pairs.forEach(function (pair) {
        var line = document.createElement("div");
        line.className = "player";
        var dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = Sim.safeColor(pair.color);
        var text = document.createElement("span");
        text.className = "grow";
        text.textContent = (pair.label || "Par") + " · " + (pair.names || []).join(" e ");
        var size = document.createElement("span");
        size.textContent = String(pair.length);
        line.appendChild(dot);
        line.appendChild(text);
        line.appendChild(size);
        pairs.appendChild(line);
      });
    }
    var rows = $("result-rows");
    empty(rows);
    var list = (winner && winner.rows) || [];
    list.forEach(function (row, index) {
      var li = document.createElement("li");
      var who = document.createElement("span");
      who.textContent = index + 1 + ". " + row.name;
      var meta = document.createElement("span");
      meta.textContent = row.length + (row.kills ? " · " + row.kills + " abates" : "");
      li.appendChild(who);
      li.appendChild(meta);
      rows.appendChild(li);
    });
    var again = $("result-again");
    again.hidden = !(session.role === "host");
    again.textContent = matchKind === "net" ? "Voltar à sala" : "Jogar de novo";
    resultEl.hidden = false;
  }

  function playAgain() {
    if (!session || session.role !== "host") return;
    resultEl.hidden = true;
    resultShown = false;
    if (matchKind === "net") {
      deliver(Session.hostPlayAgain(session));
      show("lobby");
      renderLobby();
      pushAds();
      return;
    }
    Session.hostPlayAgain(session);
    Session.hostStart(session);
    clearMatchInput();
    show("play");
  }

  function findSnake(view, id) {
    var snakes = (view && view.snakes) || [];
    for (var i = 0; i < snakes.length; i++) if (snakes[i].id === id) return snakes[i];
    return null;
  }

  function deathLine(me, view) {
    if (!me) return "";
    if (me.cause === "wall") return "A borda te pegou";
    if (me.cause === "head") return "Choque de frente";
    if (me.cause === "snake") {
      var killer = findSnake(view, me.killerId);
      return "Você bateu em " + (killer ? killer.name : "outra cobra");
    }
    return "Você morreu";
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.ceil(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateHud(view, now) {
    var ids = Session.localHumanIds(session);
    var split = ids.length >= 2 && session.role === "host";
    hud.classList.toggle("split", split);
    divider.hidden = !split;
    sideLeft.hidden = !split;
    sideRight.hidden = !split;
    boost2Btn.hidden = !split;
    boardEl.hidden = split;
    mapWrap.hidden = split;
    partnerEl.hidden = split;
    var focusId = session.role === "client" ? session.youId : ids[0];
    var me = findSnake(view, focusId) || (view.snakes && view.snakes[0]);
    if (view.endless) timerEl.textContent = best > Sim.CONFIG.startLength ? "Recorde " + best : "Treino";
    else timerEl.textContent = formatTime(view.left);
    sizeEl.textContent = me ? String(Math.round(me.length)) : "0";
    if (me && view.endless) {
      var sized = Math.floor(me.length);
      if (sized > Sim.CONFIG.startLength && sized > best) {
        best = sized;
        persist();
        timerEl.textContent = "Recorde " + best;
      }
    }
    if (!split && view.mode === "dupla" && me) {
      var mate = null;
      for (var i = 0; i < view.snakes.length; i++) {
        var other = view.snakes[i];
        if (other !== me && other.team != null && other.team === me.team) mate = other;
      }
      partnerEl.textContent = mate ? "Seu par: " + mate.name : "Sem par";
    } else {
      partnerEl.textContent = "";
    }
    if (split) {
      var left = findSnake(view, ids[0]);
      var right = findSnake(view, ids[1]);
      sideLeft.textContent = left ? left.name + " · " + Math.round(left.length) : "";
      sideRight.textContent = right ? right.name + " · " + Math.round(right.length) : "";
    }
    if (split) {
      var notes = [];
      if (left && !left.alive) notes.push(left.name + " caiu");
      if (right && !right.alive) notes.push(right.name + " caiu");
      deathEl.hidden = notes.length === 0;
      if (notes.length) deathEl.textContent = notes.join(" · ");
    } else if (me && !me.alive) {
      deathEl.hidden = false;
      deathEl.textContent = deathLine(me, view) + " · voltando em " + Number(me.respawnIn || 0).toFixed(1) + "s";
    } else {
      deathEl.hidden = true;
    }
    if (!split && me) Render.drawMinimap(mapCanvas.getContext("2d"), view, me.id);
    if (now - hudStamp < 200) return;
    hudStamp = now;
    var rank = Sim.rankings(view);
    if (view.mode === "dupla" && rank.pairs) {
      totalsEl.textContent = rank.pairs.map(function (pair) {
        var label = Sim.PAIR_LABELS[pair.team % Sim.PAIR_LABELS.length] || "Par";
        return label + " " + Math.round(pair.length);
      }).join("   ");
    } else {
      totalsEl.textContent = "";
    }
    empty(boardEl);
    rank.snakes.slice(0, 6).forEach(function (row) {
      var li = document.createElement("li");
      if (ids.indexOf(row.id) >= 0 || row.id === session.youId) li.className = "me";
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = Sim.safeColor(row.color);
      var text = document.createElement("span");
      text.textContent = row.name + "  " + Math.round(row.length);
      li.appendChild(dot);
      li.appendChild(text);
      boardEl.appendChild(li);
    });
  }

  function follow(id, snake, dt) {
    if (!snake) return { x: 0, y: 0, zoom: 0.8 };
    var cam = cameras[id] || { x: snake.x, y: snake.y, zoom: 1, ready: false };
    var target = Math.max(0.4, Math.min(1.12, 1.12 - (snake.length || 26) / 820));
    if (!cam.ready || Math.hypot((snake.x || 0) - cam.x, (snake.y || 0) - cam.y) > 900) {
      cam.x = snake.x;
      cam.y = snake.y;
      cam.zoom = target;
      cam.ready = true;
    } else {
      var k = Math.min(1, dt * 7);
      cam.x += (snake.x - cam.x) * k;
      cam.y += (snake.y - cam.y) * k;
      cam.zoom += (target - cam.zoom) * k;
    }
    cameras[id] = cam;
    return cam;
  }

  function fitCanvas(canvas) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function currentView(now) {
    if (!session) return null;
    if (session.role === "host" && session.world && (session.phase === "playing" || session.phase === "over")) {
      return Sim.snapshot(session.world, true);
    }
    if (session.snapshot) return Render.presentView(session.snapshot, now - (session.snapAt || now));
    return null;
  }

  function boostFor(index) {
    if (index === 0) return !!(boostHeld[0] || keys.Space);
    return !!(boostHeld[1] || keys.Enter);
  }

  function applyInputs() {
    var ids = Session.localHumanIds(session);
    var arrowId = ids.length >= 2 ? ids[1] : ids[0];
    if (arrowId) {
      if (keys.ArrowLeft) aims[arrowId] = Math.PI;
      if (keys.ArrowRight) aims[arrowId] = 0;
      if (keys.ArrowUp) aims[arrowId] = -Math.PI / 2;
      if (keys.ArrowDown) aims[arrowId] = Math.PI / 2;
    }
    for (var i = 0; i < ids.length; i++) {
      var angle = aims[ids[i]];
      var boosting = boostFor(i);
      if (angle == null) {
        if (!boosting || !session.world) continue;
        var snake = null;
        for (var s = 0; s < session.world.snakes.length; s++) {
          if (session.world.snakes[s].id === ids[i]) snake = session.world.snakes[s];
        }
        if (!snake) continue;
        angle = snake.targetAngle;
      }
      Session.hostInput(session, ids[i], angle, boosting);
    }
  }

  function playLocalFx() {
    if (!session || !session.world) return;
    var ids = Session.localHumanIds(session);
    var events = session.world.events || [];
    for (var i = 0; i < events.length; i++) {
      if (ids.indexOf(events[i].id) < 0) continue;
      if (events[i].type === "eat") audio.eat();
      if (events[i].type === "death") audio.die();
    }
  }

  function aimFrom(clientX, clientY, sides) {
    var rect = viewCanvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    if (sides >= 2) {
      var side = x < rect.width / 2 ? 0 : 1;
      var originX = side === 0 ? rect.width * 0.28 : rect.width * 0.72;
      return { side: side, angle: Math.atan2(y - rect.height * 0.58, x - originX) };
    }
    return { side: 0, angle: Math.atan2(y - rect.height / 2, x - rect.width / 2) };
  }

  function takeAim(clientX, clientY) {
    if (screen !== "play" || !session) return;
    var ids = Session.localHumanIds(session);
    if (!ids.length) return;
    var info = aimFrom(clientX, clientY, ids.length);
    var id = ids[Math.min(info.side, ids.length - 1)];
    if (Math.hypot(info.angle, 0) === 0 && !isFinite(info.angle)) return;
    aims[id] = info.angle;
  }

  function drawFrame(now, dt) {
    var fitted = fitCanvas(viewCanvas);
    if (screen === "play" && session) {
      var view = currentView(now);
      if (!view) return;
      var ids = Session.localHumanIds(session);
      var split = ids.length >= 2 && session.role === "host";
      if (split) {
        Render.drawWorld(fitted.ctx, view, follow(ids[0], findSnake(view, ids[0]), dt), now, { x: 0, y: 0, w: fitted.w / 2, h: fitted.h });
        Render.drawWorld(fitted.ctx, view, follow(ids[1], findSnake(view, ids[1]), dt), now, { x: fitted.w / 2, y: 0, w: fitted.w / 2, h: fitted.h });
      } else {
        var id = session.role === "client" ? session.youId : ids[0];
        var me = findSnake(view, id) || (view.snakes && view.snakes[0]);
        Render.drawWorld(fitted.ctx, view, follow(id || "you", me, dt), now, { x: 0, y: 0, w: fitted.w, h: fitted.h });
      }
      updateHud(view, now);
      if (session.phase === "over") openResult();
      return;
    }
    if (!backdrop) return;
    var menu = Sim.snapshot(backdrop, true);
    var lead = menu.snakes[0];
    for (var i = 1; i < menu.snakes.length; i++) {
      if (menu.snakes[i].alive && menu.snakes[i].length > (lead ? lead.length : 0)) lead = menu.snakes[i];
    }
    Render.drawWorld(fitted.ctx, menu, follow("menu", lead, dt), now, { x: 0, y: 0, w: fitted.w, h: fitted.h });
  }

  function tick(now) {
    if (!lastFrame) lastFrame = now;
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (screen !== "play" && backdrop && backdrop.phase === "playing") Sim.step(backdrop, dt);
    if (screen === "play" && session && session.role === "host" && session.phase === "playing") {
      applyInputs();
      var outs = Session.hostTick(session, dt);
      deliver(outs);
      playLocalFx();
      syncPhase();
    } else if (screen === "play" && session && session.role === "client" && session.phase === "playing") {
      if (now - lastSend > 60 && session.youId) {
        var angle = aims[session.youId];
        if (angle == null && session.snapshot) {
          var mine = findSnake(session.snapshot, session.youId);
          if (mine && isFinite(mine.angle)) angle = mine.angle;
        }
        if (angle != null) {
          lastSend = now;
          nativeCommand({ op: "send", data: JSON.stringify(Session.clientInput(angle, boostFor(0))) });
        }
      }
    }
    drawFrame(now, dt);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    try {
      tick(now);
    } catch (err) {
      console.error(err);
      if (!blown) {
        blown = true;
        showToast("O jogo encontrou um erro ao desenhar. Volte ao menu e entre de novo.");
      }
    }
  }

  function holdBoost(button, index) {
    function down(event) {
      event.preventDefault();
      event.stopPropagation();
      boostHeld[index] = true;
      button.classList.add("held");
    }
    function up() {
      boostHeld[index] = false;
      button.classList.remove("held");
    }
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
  }

  function onNative(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (err) { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "prefs") {
      if (msg.name && !nameInput.value) nameInput.value = String(msg.name).slice(0, 16);
      if (typeof msg.mute === "boolean") audio.muted = msg.mute;
      if (typeof msg.best === "number" && msg.best > best) best = msg.best;
      updateMute();
      return;
    }
    if (msg.t === "ready") {
      hostInfo.ip = msg.ip || "";
      hostInfo.port = msg.port || 47655;
      hostInfo.wifi = msg.wifi !== false;
      if (screen === "lobby") renderLobby();
      return;
    }
    if (msg.t === "status") {
      hostInfo.wifi = msg.wifi !== false;
      if (msg.ip) hostInfo.ip = msg.ip;
      if (screen === "join" && hostInfo.wifi === false) {
        joinStatus.textContent = "Sem Wi-Fi detectado. Os dois celulares precisam estar na mesma rede.";
      }
      return;
    }
    if (msg.t === "rooms") {
      rooms = Array.isArray(msg.rooms) ? msg.rooms : [];
      if (screen === "join") {
        joinStatus.textContent = rooms.length ? "Toque numa sala ou digite o IP." : "Procurando salas na Wi-Fi…";
        renderRooms();
      }
      return;
    }
    if (msg.t === "connected" && session && session.role === "client") {
      nativeCommand({ op: "send", data: JSON.stringify(Session.clientHello(session)) });
      showToast("Conectou. Entrando na sala…");
      return;
    }
    if (msg.t === "disconnected") {
      if (netRole === "client" && session) {
      var connecting = session.phase === "connecting";
      failNet(msg.reason || "A conexão caiu.", connecting);
    }
      return;
    }
    if (msg.t === "error") {
      showToast(msg.message || "Erro de rede.");
      return;
    }
    if (!session || session.role !== "host") return;
    if (msg.t === "peer-open") {
      Session.hostPeerOpen(session, msg.id);
      return;
    }
    if (msg.t === "peer-close") {
      deliver(Session.hostPeerClose(session, msg.id));
      if (screen === "lobby") renderLobby();
      pushAds();
      return;
    }
    if (msg.t === "peer-msg") {
      var inner;
      try { inner = JSON.parse(msg.data); } catch (err) { return; }
      deliver(Session.hostPeerMessage(session, msg.id, inner));
      if (screen === "lobby") renderLobby();
      pushAds();
    }
  }
  window.__snakeOnNative = onNative;

  $("btn-treino").addEventListener("click", startTreino);
  $("btn-create").addEventListener("click", createRoom);
  $("btn-join").addEventListener("click", openJoin);
  $("btn-local").addEventListener("click", openLocal);
  $("btn-help").addEventListener("click", function () { show("help"); });
  $("help-back").addEventListener("click", function () { show("home"); });
  $("local-back").addEventListener("click", goBack);
  $("lobby-back").addEventListener("click", goBack);
  $("join-back").addEventListener("click", goBack);
  $("loc-go").addEventListener("click", startLocal);
  $("lobby-start").addEventListener("click", function () {
    if (!session || session.role !== "host") return;
    var name = readName();
    nameInput.value = name;
    deliver(Session.hostRename(session, name));
    deliver(Session.hostStart(session));
    clearMatchInput();
    show("play");
    pushAds();
  });
  $("result-again").addEventListener("click", playAgain);
  $("result-leave").addEventListener("click", leaveMatch);
  $("leave-stay").addEventListener("click", function () { leaveModal.hidden = true; });
  $("leave-yes").addEventListener("click", leaveMatch);
  $("join-go").addEventListener("click", function () {
    var addr = parseAddress(joinIp.value);
    if (!addr) {
      showToast("Digite um IP, por exemplo 192.168.0.10");
      return;
    }
    joinAddress(addr.ip, addr.port);
  });
  nameInput.addEventListener("change", function () {
    readName();
    persist();
    if (session && session.role === "host" && session.phase === "lobby") {
      deliver(Session.hostRename(session, nameInput.value));
      renderLobby();
      pushAds();
    }
  });
  lobBots.addEventListener("change", function () {
    if (!session || session.role !== "host") return;
    deliver(Session.hostSetBots(session, lobBots.checked));
    renderLobby();
    pushAds();
  });
  $("lob-dupla").addEventListener("click", function () { pickLobbyMode("dupla"); });
  $("lob-contra").addEventListener("click", function () { pickLobbyMode("contra"); });
  $("loc-dupla").addEventListener("click", function () {
    localMode = "dupla";
    setModeButtons("local-modes", localMode);
  });
  $("loc-contra").addEventListener("click", function () {
    localMode = "contra";
    setModeButtons("local-modes", localMode);
  });
  muteBtn.addEventListener("click", function () {
    audio.muted = !audio.muted;
    updateMute();
    persist();
  });
  document.addEventListener("pointerdown", function () { audio.unlock(); }, { passive: true });

  function pickLobbyMode(mode) {
    if (!session || session.role !== "host") return;
    deliver(Session.hostSetMode(session, mode));
    renderLobby();
    pushAds();
  }

  viewCanvas.addEventListener("pointerdown", function (event) {
    pointers[event.pointerId] = true;
    takeAim(event.clientX, event.clientY);
  });
  viewCanvas.addEventListener("pointermove", function (event) {
    var active = event.pointerType !== "touch" || pointers[event.pointerId];
    if (!active) return;
    takeAim(event.clientX, event.clientY);
  });
  function forgetPointer(event) { delete pointers[event.pointerId]; }
  viewCanvas.addEventListener("pointerup", forgetPointer);
  viewCanvas.addEventListener("pointercancel", forgetPointer);

  window.addEventListener("keydown", function (event) {
    keys[event.code] = true;
    if (screen === "play" && (event.code === "Space" || event.code === "Enter" || event.code.indexOf("Arrow") === 0)) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", function (event) { keys[event.code] = false; });
  window.addEventListener("blur", function () {
    keys = {};
    boostHeld = [false, false];
    boostBtn.classList.remove("held");
    boost2Btn.classList.remove("held");
  });

  holdBoost(boostBtn, 0);
  holdBoost(boost2Btn, 1);

  if (!native && /[?&]debug=1/.test(location.search)) {
    window.__snakeDebugEnd = function () {
      if (session && session.world && session.world.left != null) session.world.left = 0.05;
    };
  }

  loadLocalPrefs();
  if (native) {
    nativeCommand({ op: "ready" });
    nativeCommand({ op: "loadPrefs" });
  }
  show("home");
  requestAnimationFrame(frame);
})();
