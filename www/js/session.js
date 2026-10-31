"use strict";

// Sala da rede local. O anfitrião (o primeiro na Wi-Fi) guarda a lista e
// a simulação. Cada mensagem devolvida é { to, msg }: "*" vai para todos
// os celulares conectados, um id vai só para aquele aparelho.

var Sim = typeof module !== "undefined" && module.exports ? require("./sim.js") : window.SnakeSim;

var PROTOCOL = 1;

function cleanName(name) {
  var s = String(typeof name === "string" ? name : "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "Jogador";
  var chars = Array.from(s);
  if (chars.length > 16) s = chars.slice(0, 16).join("");
  return s;
}

function createHostSession(opts) {
  opts = opts || {};
  var session = {
    role: "host",
    mode: opts.mode === "dupla" ? "dupla" : "contra",
    fillBots: opts.fillBots !== false,
    endless: !!opts.endless,
    phase: "lobby",
    youId: "p1",
    players: [
      {
        id: "p1",
        name: cleanName(opts.name),
        host: true,
        local: true,
        peerId: null,
      },
    ],
    peers: {},
    nextPid: 2,
    world: null,
    result: null,
    seed: opts.seed == null ? Date.now() & 0x7fffffff : opts.seed >>> 0,
    acc: 0,
  };
  return session;
}

function createClientSession(opts) {
  opts = opts || {};
  return {
    role: "client",
    name: cleanName(opts.name),
    phase: "connecting",
    youId: null,
    mode: "contra",
    fillBots: true,
    endless: false,
    players: [],
    snapshot: null,
    snapAt: 0,
    result: null,
    error: null,
  };
}

function lobbyPlayers(session) {
  var cursor = {};
  return session.players.map(function (p, i) {
    var team = session.mode === "dupla" ? Math.floor(i / 2) : null;
    return {
      id: p.id,
      name: p.name,
      host: !!p.host,
      team: team,
      pair: team == null ? null : team + 1,
      pairLabel: team == null ? null : Sim.PAIR_LABELS[team % Sim.PAIR_LABELS.length],
      color: Sim.pickColor(session.mode, team, i, cursor),
    };
  });
}

function lobbyMessage(session) {
  return {
    t: "lobby",
    mode: session.mode,
    fillBots: !!session.fillBots,
    endless: !!session.endless,
    players: lobbyPlayers(session),
  };
}

function broadcast(msg) {
  return { to: "*", msg: msg };
}

function direct(id, msg) {
  return { to: id, msg: msg };
}

function hostSetMode(session, mode) {
  if (!session || session.phase !== "lobby") return [];
  var next = mode === "dupla" ? "dupla" : "contra";
  if (next === session.mode) return [];
  session.mode = next;
  return [broadcast(lobbyMessage(session))];
}

function hostRename(session, name) {
  if (!session || session.phase !== "lobby") return [];
  for (var i = 0; i < session.players.length; i++) {
    if (session.players[i].id === session.youId) session.players[i].name = cleanName(name);
  }
  return [broadcast(lobbyMessage(session))];
}

function hostSetBots(session, fill) {
  if (!session || session.phase !== "lobby") return [];
  session.fillBots = !!fill;
  return [broadcast(lobbyMessage(session))];
}

function hostMove(session, id, dir) {
  if (!session || session.phase !== "lobby") return [];
  var i = -1;
  for (var n = 0; n < session.players.length; n++) {
    if (session.players[n].id === id) i = n;
  }
  var j = i + dir;
  if (i < 0 || j < 0 || j >= session.players.length) return [];
  var tmp = session.players[i];
  session.players[i] = session.players[j];
  session.players[j] = tmp;
  return [broadcast(lobbyMessage(session))];
}

function hostAddLocal(session, name) {
  if (!session || session.phase !== "lobby") return [];
  if (session.players.length >= Sim.CONFIG.maxSnakes) return [];
  var id = "p" + session.nextPid++;
  session.players.push({
    id: id,
    name: cleanName(name),
    host: false,
    local: true,
    peerId: null,
  });
  return [broadcast(lobbyMessage(session))];
}

function localHumanIds(session) {
  if (!session) return [];
  if (session.role === "client") return session.youId ? [session.youId] : [];
  return session.players
    .filter(function (p) {
      return p.host || p.local;
    })
    .map(function (p) {
      return p.id;
    });
}

function hostStart(session) {
  if (!session || session.phase !== "lobby" || !session.players.length) return [];
  var specs = session.players.map(function (p, i) {
    return {
      id: p.id,
      name: p.name,
      team: session.mode === "dupla" ? Math.floor(i / 2) : null,
    };
  });
  session.world = Sim.createMatch({
    mode: session.mode,
    seed: session.seed,
    endless: session.endless,
    players: specs,
    fillBots: session.fillBots,
    botTarget: Sim.CONFIG.botTarget,
  });
  session.phase = "playing";
  session.result = null;
  session.acc = 0;
  var snap = Sim.snapshot(session.world, false);
  return [broadcast({ t: "start", mode: session.mode, endless: !!session.endless }), broadcast(snap)];
}

function hostPlayAgain(session) {
  if (!session) return [];
  session.phase = "lobby";
  session.world = null;
  session.result = null;
  session.seed = (session.seed + 1) & 0x7fffffff;
  session.acc = 0;
  return [broadcast(lobbyMessage(session))];
}

function hostInput(session, id, angle, boost) {
  if (!session || !session.world || session.phase !== "playing") return;
  Sim.setInput(session.world, id, angle, boost);
}

function hostPeerOpen(session, peerId) {
  if (!session || !peerId) return;
  if (session.peers[peerId] === undefined) session.peers[peerId] = null;
}

function hostPeerClose(session, peerId) {
  if (!session || !peerId) return [];
  var playerId = session.peers[peerId];
  delete session.peers[peerId];
  if (!playerId) return [];
  session.players = session.players.filter(function (p) {
    return p.id !== playerId;
  });
  var outs = [];
  if (session.world) {
    Sim.dismissSnake(session.world, playerId);
    for (var i = 0; i < session.world.events.length; i++) {
      var e = session.world.events[i];
      if (e.type === "death") {
        outs.push(broadcast({ t: "fx", kind: "die", id: e.id, cause: e.cause, killerId: e.killerId }));
      }
    }
    outs.push(broadcast(Sim.snapshot(session.world, false)));
  }
  if (session.phase === "lobby") outs.push(broadcast(lobbyMessage(session)));
  return outs;
}

function hostPeerMessage(session, peerId, msg) {
  if (!session || !peerId || !msg || typeof msg !== "object") return [];
  if (msg.t === "hello") {
    if (session.peers[peerId]) return [];
    if (msg.v !== PROTOCOL) {
      return [direct(peerId, { t: "bye", reason: "Atualize o Snake Livre para entrar nesta sala." })];
    }
    if (session.phase !== "lobby") {
      return [direct(peerId, { t: "busy", reason: "A partida já começou." })];
    }
    if (session.players.length >= Sim.CONFIG.maxSnakes) {
      return [direct(peerId, { t: "full", reason: "A sala está cheia." })];
    }
    var id = "p" + session.nextPid++;
    var name = cleanName(msg.name);
    session.players.push({
      id: id,
      name: name,
      host: false,
      local: false,
      peerId: peerId,
    });
    session.peers[peerId] = id;
    return [
      direct(peerId, { t: "welcome", v: PROTOCOL, id: id, name: name }),
      broadcast(lobbyMessage(session)),
    ];
  }
  if (msg.t === "input") {
    var playerId = session.peers[peerId];
    if (!playerId || !session.world) return [];
    hostInput(session, playerId, msg.angle, msg.boost);
    return [];
  }
  return [];
}

function fxFrom(world) {
  var outs = [];
  if (!world) return outs;
  for (var i = 0; i < world.events.length; i++) {
    var e = world.events[i];
    if (e.type === "death") {
      outs.push(broadcast({ t: "fx", kind: "die", id: e.id, cause: e.cause, killerId: e.killerId }));
    } else if (e.type === "eat") {
      outs.push(broadcast({ t: "fx", kind: "eat", id: e.id }));
    }
  }
  return outs;
}

function hostTick(session, dt) {
  if (!session || session.phase !== "playing" || !session.world) return [];
  Sim.step(session.world, dt);
  var outs = fxFrom(session.world);
  session.acc += dt;
  if (session.acc >= 1 / 12) {
    session.acc = 0;
    outs.push(broadcast(Sim.snapshot(session.world, false)));
  }
  if (session.world.phase === "over") {
    session.phase = "over";
    session.result = session.world.winner;
    outs.push(broadcast(Sim.snapshot(session.world, false)));
    outs.push(broadcast({ t: "over", winner: session.world.winner }));
  }
  return outs;
}

function clientHello(session) {
  return { t: "hello", v: PROTOCOL, name: session.name };
}

function clientInput(angle, boost) {
  return { t: "input", angle: angle, boost: !!boost };
}

function clientReceive(session, msg) {
  if (!session || !msg || typeof msg !== "object") return;
  if (msg.t === "welcome") {
    session.youId = msg.id;
    session.name = msg.name || session.name;
    session.error = null;
  } else if (msg.t === "lobby") {
    session.phase = "lobby";
    session.mode = msg.mode === "dupla" ? "dupla" : "contra";
    session.fillBots = !!msg.fillBots;
    session.endless = !!msg.endless;
    session.players = Array.isArray(msg.players) ? msg.players : [];
    session.result = null;
    session.snapshot = null;
    session.error = null;
  } else if (msg.t === "start") {
    session.phase = "playing";
    session.mode = msg.mode === "dupla" ? "dupla" : session.mode;
    session.endless = !!msg.endless;
    session.error = null;
  } else if (msg.t === "state") {
    if (!Array.isArray(msg.snakes) || msg.snakes.length > 16) return;
    if (!Array.isArray(msg.foods) || msg.foods.length > 800) return;
    session.snapshot = msg;
    session.snapAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (msg.phase === "over") {
      session.phase = "over";
      session.result = msg.winner || session.result;
    } else if (session.phase !== "over") {
      session.phase = "playing";
    }
  } else if (msg.t === "over") {
    session.phase = "over";
    session.result = msg.winner || session.result;
  } else if (msg.t === "full" || msg.t === "busy" || msg.t === "bye") {
    session.phase = "error";
    session.error = typeof msg.reason === "string" ? msg.reason : "Não foi possível entrar.";
  }
}

var api = {
  PROTOCOL: PROTOCOL,
  cleanName: cleanName,
  createHostSession: createHostSession,
  createClientSession: createClientSession,
  lobbyPlayers: lobbyPlayers,
  hostSetMode: hostSetMode,
  hostRename: hostRename,
  hostSetBots: hostSetBots,
  hostMove: hostMove,
  hostAddLocal: hostAddLocal,
  localHumanIds: localHumanIds,
  hostStart: hostStart,
  hostPlayAgain: hostPlayAgain,
  hostInput: hostInput,
  hostPeerOpen: hostPeerOpen,
  hostPeerClose: hostPeerClose,
  hostPeerMessage: hostPeerMessage,
  hostTick: hostTick,
  clientHello: clientHello,
  clientInput: clientInput,
  clientReceive: clientReceive,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.SnakeSession = api;
