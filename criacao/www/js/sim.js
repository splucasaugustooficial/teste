"use strict";

// Simulação autoritativa do Snake Livre. No multiplayer ela roda só no
// celular que criou a sala; os outros mandam a mira e desenham o snapshot.
// Assim a partida não depende de servidor na internet.

var CONFIG = {
  arenaRadius: 2400,
  baseSpeed: 230,
  boostSpeed: 390,
  turnRate: 4.4,
  spacing: 8,
  headRadius: 12,
  bodyRadius: 11,
  eatBase: 22,
  startLength: 26,
  maxLength: 520,
  foodTarget: 150,
  foodCap: 640,
  foodValue: 2.6,
  deathFoodValue: 2.2,
  boostDrain: 20,
  respawn: 3,
  grace: 2,
  roundSeconds: 180,
  botThink: 0.18,
  maxSnakes: 8,
  botTarget: 6,
};

var CONTRA_COLORS = [
  "#3dff9a",
  "#4cc9f0",
  "#ff5d8f",
  "#ffd60a",
  "#c77dff",
  "#ff8a3d",
  "#80ffdb",
  "#f4f1de",
];

var PAIR_COLORS = [
  ["#3ee0ff", "#7aa2ff"],
  ["#ffb703", "#fb8500"],
  ["#c77dff", "#ff5d8f"],
  ["#80ffdb", "#2ec4b6"],
];

var PAIR_LABELS = ["Azul", "Laranja", "Roxa", "Verde"];

var BOT_NAMES = ["Naja", "Pixel", "Listra", "Vera", "Dente", "Loop", "Zig", "Mina", "Otto", "Coral"];

function mulberry32(seed) {
  var a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapAngle(a) {
  var x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function steer(current, target, maxDelta) {
  var d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxDelta) d = maxDelta;
  if (d < -maxDelta) d = -maxDelta;
  return wrapAngle(current + d);
}

function safeColor(c, fallback) {
  if (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return fallback || "#3dff9a";
}

function pickColor(mode, team, index, cursor) {
  if (mode !== "dupla" || team == null) {
    return CONTRA_COLORS[index % CONTRA_COLORS.length];
  }
  var palette = PAIR_COLORS[team % PAIR_COLORS.length];
  var n = cursor[team] || 0;
  cursor[team] = n + 1;
  return palette[n % palette.length];
}

function sizeFactor(length) {
  return Math.min(Math.max(length, 0), 280) / 280;
}

function currentSpeed(snake) {
  var big = sizeFactor(snake.length);
  var boosting = snake.boost && snake.length > CONFIG.startLength + 2;
  var base = boosting ? CONFIG.boostSpeed : CONFIG.baseSpeed;
  return base * (1 - big * 0.18);
}

function buildBody(snake) {
  var n = Math.max(2, Math.floor(snake.length));
  snake.points = [];
  for (var i = n - 1; i >= 0; i--) {
    snake.points.push({
      x: snake.x - Math.cos(snake.angle) * i * CONFIG.spacing,
      y: snake.y - Math.sin(snake.angle) * i * CONFIG.spacing,
    });
  }
}

function createMatch(opts) {
  opts = opts || {};
  var mode = opts.mode === "dupla" ? "dupla" : "contra";
  var world = {
    mode: mode,
    phase: "playing",
    endless: !!opts.endless,
    left: opts.endless ? null : opts.roundSeconds == null ? CONFIG.roundSeconds : opts.roundSeconds,
    elapsed: 0,
    rng: mulberry32(opts.seed == null ? Date.now() & 0x7fffffff : opts.seed >>> 0),
    snakes: [],
    foods: [],
    events: [],
    winner: null,
    arenaRadius: CONFIG.arenaRadius,
  };
  var humans = (opts.players || []).map(function (p, i) {
    var team = null;
    if (mode === "dupla") team = p.team == null ? Math.floor(i / 2) : p.team;
    return {
      id: p.id || "p" + (i + 1),
      name: p.name || "Jogador",
      team: team,
      isBot: false,
    };
  });
  var all = humans.slice();
  if (opts.fillBots) {
    var target = Math.min(CONFIG.maxSnakes, opts.botTarget == null ? CONFIG.botTarget : opts.botTarget);
    var need = Math.max(0, target - all.length);
    var used = {};
    humans.forEach(function (p) {
      used[p.name] = true;
    });
    for (var b = 0; b < need; b++) {
      var index = all.length;
      var teamB = mode === "dupla" ? Math.floor(index / 2) : null;
      var name = BOT_NAMES[b % BOT_NAMES.length];
      if (used[name]) name = name + " " + (b + 1);
      used[name] = true;
      all.push({ id: "b" + (b + 1), name: name, team: teamB, isBot: true });
    }
  }
  var cursor = {};
  all.forEach(function (p, index) {
    world.snakes.push({
      id: p.id,
      name: p.name,
      color: pickColor(mode, p.team, index, cursor),
      team: p.team,
      isBot: !!p.isBot,
      x: 0,
      y: 0,
      angle: 0,
      targetAngle: 0,
      length: CONFIG.startLength,
      alive: true,
      boost: false,
      grace: 0,
      respawnIn: 0,
      kills: 0,
      eaten: 0,
      points: [],
      thinkIn: world.rng() * CONFIG.botThink,
      inputAge: 0,
      cause: null,
      killerId: null,
    });
  });
  placeSnakes(world);
  fillFoods(world);
  return world;
}

function placeSnakes(world) {
  var n = world.snakes.length;
  if (n === 0) return;
  if (n === 1) {
    var only = world.snakes[0];
    only.x = 0;
    only.y = 0;
    only.angle = 0;
    only.targetAngle = 0;
    buildBody(only);
    return;
  }
  var r = world.arenaRadius * 0.42;
  world.snakes.forEach(function (s, i) {
    var a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    s.x = Math.cos(a) * r;
    s.y = Math.sin(a) * r;
    s.angle = wrapAngle(a + Math.PI);
    s.targetAngle = s.angle;
    buildBody(s);
  });
}

function fillFoods(world) {
  var guard = 0;
  while (world.foods.length < CONFIG.foodTarget && guard < 800) {
    spawnRandomFood(world, CONFIG.foodValue);
    guard++;
  }
}

function spawnRandomFood(world, value) {
  var a = world.rng() * Math.PI * 2;
  var r = Math.sqrt(world.rng()) * (world.arenaRadius - 60);
  world.foods.push({
    x: Math.cos(a) * r,
    y: Math.sin(a) * r,
    kind: (world.rng() * 4) | 0,
    value: value,
  });
}

function setInput(world, id, angle, boost) {
  if (!world) return;
  var snake = null;
  for (var i = 0; i < world.snakes.length; i++) {
    if (world.snakes[i].id === id) {
      snake = world.snakes[i];
      break;
    }
  }
  if (!snake || !snake.alive) return;
  if (typeof angle === "number" && isFinite(angle) && Math.abs(angle) < 1e6) {
    snake.targetAngle = wrapAngle(angle);
  }
  snake.boost = !!boost;
  snake.inputAge = 0;
}

function think(world, snake) {
  var bestA = snake.angle;
  var bestS = -1e9;
  var foods = world.foods;
  for (var i = -4; i <= 4; i++) {
    var a = snake.angle + i * 0.28;
    var look = 170;
    var x = snake.x + Math.cos(a) * look;
    var y = snake.y + Math.sin(a) * look;
    var score = -Math.abs(i) * 0.2;
    var wallD = Math.hypot(x, y);
    var margin = world.arenaRadius - 180;
    if (wallD > margin) score -= (wallD - margin) * 0.09;
    var nearest = 1e12;
    for (var f = 0; f < foods.length; f++) {
      var dx = foods[f].x - x;
      var dy = foods[f].y - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < nearest) nearest = d2;
    }
    score += Math.max(0, 240 - Math.sqrt(nearest)) * 0.045;
    for (var s = 0; s < world.snakes.length; s++) {
      var other = world.snakes[s];
      if (other === snake || !other.alive) continue;
      if (world.mode === "dupla" && other.team != null && other.team === snake.team) continue;
      var pts = other.points;
      var stride = 3;
      for (var p = 0; p < pts.length; p += stride) {
        var px = pts[p].x - x;
        var py = pts[p].y - y;
        var pd = px * px + py * py;
        if (pd < 75 * 75) score -= (75 - Math.sqrt(pd)) * 0.4;
      }
      var hx = other.x - x;
      var hy = other.y - y;
      var hd = hx * hx + hy * hy;
      if (hd < 96 * 96) score -= (96 - Math.sqrt(hd)) * 0.55;
    }
    if (score > bestS) {
      bestS = score;
      bestA = a;
    }
  }
  snake.targetAngle = wrapAngle(bestA);
  var wallNow = Math.hypot(snake.x, snake.y);
  snake.boost = bestS < -6 && snake.length > CONFIG.startLength + 10 && wallNow > world.arenaRadius * 0.35;
}

function kill(world, snake, cause, killerId) {
  if (!snake.alive) return;
  snake.alive = false;
  snake.boost = false;
  snake.cause = cause;
  snake.killerId = killerId || null;
  snake.respawnIn = CONFIG.respawn;
  dropFood(world, snake);
  snake.length = CONFIG.startLength;
  snake.points = [];
  if (killerId) {
    for (var i = 0; i < world.snakes.length; i++) {
      if (world.snakes[i].id === killerId) {
        world.snakes[i].kills += 1;
        break;
      }
    }
  }
  world.events.push({ type: "death", id: snake.id, cause: cause, killerId: killerId || null });
}

function dropFood(world, snake) {
  var pts = snake.points;
  if (!pts.length) return;
  var stepN = Math.max(1, Math.floor(pts.length / 70));
  for (var i = 0; i < pts.length; i += stepN) {
    if (world.foods.length >= CONFIG.foodCap) break;
    var p = pts[i];
    world.foods.push({
      x: p.x + (world.rng() - 0.5) * 18,
      y: p.y + (world.rng() - 0.5) * 18,
      kind: (world.rng() * 4) | 0,
      value: CONFIG.deathFoodValue,
    });
  }
}

function dismissSnake(world, id) {
  var snake = null;
  for (var i = 0; i < world.snakes.length; i++) {
    if (world.snakes[i].id === id) snake = world.snakes[i];
  }
  if (!snake) return;
  if (snake.alive) kill(world, snake, "leave", null);
  world.snakes = world.snakes.filter(function (s) {
    return s.id !== id;
  });
}

function respawn(world, snake) {
  var best = { x: 0, y: 0, score: -1 };
  for (var k = 0; k < 24; k++) {
    var a = world.rng() * Math.PI * 2;
    var r = Math.sqrt(world.rng()) * world.arenaRadius * 0.68;
    var x = Math.cos(a) * r;
    var y = Math.sin(a) * r;
    var minD = Infinity;
    for (var i = 0; i < world.snakes.length; i++) {
      var o = world.snakes[i];
      if (o === snake || !o.alive) continue;
      var d = Math.hypot(o.x - x, o.y - y);
      if (d < minD) minD = d;
    }
    if (minD > best.score) best = { x: x, y: y, score: minD };
    if (minD > 300) break;
  }
  snake.x = best.x;
  snake.y = best.y;
  snake.angle = wrapAngle(world.rng() * Math.PI * 2);
  snake.targetAngle = snake.angle;
  snake.length = CONFIG.startLength;
  snake.alive = true;
  snake.boost = false;
  snake.grace = CONFIG.grace;
  snake.respawnIn = 0;
  snake.cause = null;
  snake.killerId = null;
  snake.inputAge = 0;
  buildBody(snake);
  world.events.push({ type: "spawn", id: snake.id });
}

function eatReach(snake) {
  return CONFIG.eatBase + Math.min(snake.length, 180) * 0.035;
}

function moveSnake(world, snake, dt) {
  snake.inputAge += dt;
  if (!snake.isBot && snake.inputAge > 0.4) snake.boost = false;
  if (snake.isBot) {
    snake.thinkIn -= dt;
    if (snake.thinkIn <= 0) {
      think(world, snake);
      snake.thinkIn = CONFIG.botThink;
    }
  }
  var big = sizeFactor(snake.length);
  var turn = CONFIG.turnRate * (1 - big * 0.35) * dt;
  snake.angle = steer(snake.angle, snake.targetAngle, turn);
  var boosting = snake.boost && snake.length > CONFIG.startLength + 2;
  if (boosting) {
    snake.length = Math.max(CONFIG.startLength, snake.length - CONFIG.boostDrain * dt);
  }
  var speed = currentSpeed(snake);
  snake.x += Math.cos(snake.angle) * speed * dt;
  snake.y += Math.sin(snake.angle) * speed * dt;
  if (snake.grace > 0) {
    snake.grace = Math.max(0, snake.grace - dt);
    var dist = Math.hypot(snake.x, snake.y);
    var max = world.arenaRadius - CONFIG.headRadius - 8;
    if (dist > max && dist > 0) {
      snake.x *= max / dist;
      snake.y *= max / dist;
    }
  }
  if (!snake.points.length) snake.points.push({ x: snake.x, y: snake.y });
  var last = snake.points[snake.points.length - 1];
  if (Math.hypot(snake.x - last.x, snake.y - last.y) >= CONFIG.spacing) {
    snake.points.push({ x: snake.x, y: snake.y });
  }
  var keep = Math.max(2, Math.floor(snake.length));
  while (snake.points.length > keep) snake.points.shift();
  if (snake.length > CONFIG.maxLength) snake.length = CONFIG.maxLength;
}

function eatFoods(world, snake) {
  var reach = eatReach(snake);
  var reach2 = reach * reach;
  var keep = [];
  for (var i = 0; i < world.foods.length; i++) {
    var f = world.foods[i];
    var dx = f.x - snake.x;
    var dy = f.y - snake.y;
    if (dx * dx + dy * dy <= reach2) {
      snake.length = Math.min(CONFIG.maxLength, snake.length + f.value);
      snake.eaten += 1;
      world.events.push({ type: "eat", id: snake.id });
    } else {
      keep.push(f);
    }
  }
  world.foods = keep;
}

function collide(world) {
  var doomed = [];
  var snakes = world.snakes;
  var reach = CONFIG.headRadius + CONFIG.bodyRadius;
  var reach2 = reach * reach;
  for (var i = 0; i < snakes.length; i++) {
    var snake = snakes[i];
    if (!snake.alive || snake.grace > 0) continue;
    if (Math.hypot(snake.x, snake.y) + CONFIG.headRadius > world.arenaRadius) {
      doomed.push({ snake: snake, cause: "wall", killerId: null });
      continue;
    }
    var hit = null;
    for (var j = 0; j < snakes.length && !hit; j++) {
      var other = snakes[j];
      if (other === snake || !other.alive) continue;
      if (world.mode === "dupla" && snake.team != null && snake.team === other.team) continue;
      var pts = other.points;
      var limit = Math.max(0, pts.length - 5);
      for (var p = 0; p < limit; p++) {
        var dx = pts[p].x - snake.x;
        var dy = pts[p].y - snake.y;
        if (dx * dx + dy * dy <= reach2) {
          hit = other;
          break;
        }
      }
    }
    if (hit) doomed.push({ snake: snake, cause: "snake", killerId: hit.id });
  }
  var headReach = CONFIG.headRadius * 2;
  var head2 = headReach * headReach;
  for (var a = 0; a < snakes.length; a++) {
    var sa = snakes[a];
    if (!sa.alive || sa.grace > 0) continue;
    if (doomed.some(function (d) { return d.snake === sa; })) continue;
    for (var b = a + 1; b < snakes.length; b++) {
      var sb = snakes[b];
      if (!sb.alive || sb.grace > 0) continue;
      if (world.mode === "dupla" && sa.team != null && sa.team === sb.team) continue;
      var hx = sa.x - sb.x;
      var hy = sa.y - sb.y;
      if (hx * hx + hy * hy <= head2) {
        doomed.push({ snake: sa, cause: "head", killerId: null });
        doomed.push({ snake: sb, cause: "head", killerId: null });
      }
    }
  }
  for (var k = 0; k < doomed.length; k++) {
    kill(world, doomed[k].snake, doomed[k].cause, doomed[k].killerId);
  }
}

function stepOnce(world, dt) {
  if (world.phase !== "playing") return;
  for (var i = 0; i < world.snakes.length; i++) {
    var snake = world.snakes[i];
    if (!snake.alive) {
      snake.respawnIn -= dt;
      if (snake.respawnIn <= 0) respawn(world, snake);
      continue;
    }
    moveSnake(world, snake, dt);
    if (snake.alive) eatFoods(world, snake);
  }
  collide(world);
  fillFoods(world);
  world.elapsed += dt;
  if (!world.endless && world.left != null) {
    world.left -= dt;
    if (world.left <= 0) {
      world.left = 0;
      world.phase = "over";
      world.winner = decideWinner(world);
    }
  }
}

function step(world, dt) {
  if (!world || world.phase !== "playing") return world;
  if (!(dt > 0)) return world;
  world.events = [];
  var slices = dt > 1 / 30 ? Math.ceil(dt / (1 / 60)) : 1;
  if (slices > 6) slices = 6;
  var sub = dt / slices;
  var all = [];
  for (var i = 0; i < slices; i++) {
    world.events = [];
    stepOnce(world, sub);
    for (var e = 0; e < world.events.length; e++) all.push(world.events[e]);
    if (world.phase !== "playing") break;
  }
  world.events = all;
  return world;
}

function rankings(source) {
  var mode = source.mode === "dupla" ? "dupla" : "contra";
  var snakes = (source.snakes || []).map(function (s) {
    return {
      id: s.id,
      name: s.name,
      team: s.team,
      color: safeColor(s.color),
      length: s.length,
      kills: s.kills || 0,
      alive: !!s.alive,
      bot: !!(s.bot || s.isBot),
    };
  });
  snakes.sort(function (a, b) {
    return b.length - a.length || b.kills - a.kills || String(a.name).localeCompare(String(b.name));
  });
  if (mode !== "dupla") return { snakes: snakes, pairs: null };
  var byTeam = {};
  (source.snakes || []).forEach(function (s) {
    var key = String(s.team);
    if (!byTeam[key]) byTeam[key] = [];
    byTeam[key].push(s);
  });
  var pairs = Object.keys(byTeam).map(function (key) {
    var members = byTeam[key];
    var length = 0;
    var kills = 0;
    members.forEach(function (s) {
      length += s.length;
      kills += s.kills || 0;
    });
    return {
      team: members[0].team,
      length: length,
      kills: kills,
      names: members.map(function (s) { return s.name; }),
      color: safeColor(members[0].color),
    };
  });
  pairs.sort(function (a, b) {
    return b.length - a.length || b.kills - a.kills || a.team - b.team;
  });
  return { snakes: snakes, pairs: pairs };
}

function presentRow(s) {
  return {
    id: s.id,
    name: s.name,
    team: s.team,
    color: s.color,
    length: Math.round(s.length),
    kills: s.kills,
    alive: s.alive,
    bot: s.bot,
  };
}

function decideWinner(world) {
  var rank = rankings(world);
  if (!rank.snakes.length) return null;
  if (world.mode === "dupla") {
    if (!rank.pairs.length) return null;
    var top = rank.pairs[0];
    var second = rank.pairs[1];
    var tie = !!(second && Math.abs(second.length - top.length) < 0.01 && second.kills === top.kills);
    return {
      kind: "pair",
      tie: tie,
      title: top.names.join(" e "),
      team: top.team,
      length: Math.round(top.length),
      rows: rank.snakes.map(presentRow),
      pairs: rank.pairs.map(function (p) {
        return {
          team: p.team,
          length: Math.round(p.length),
          kills: p.kills,
          names: p.names.slice(),
          color: p.color,
          label: PAIR_LABELS[p.team % PAIR_LABELS.length],
        };
      }),
    };
  }
  var best = rank.snakes[0];
  var next = rank.snakes[1];
  var tied = !!(next && Math.abs(next.length - best.length) < 0.01 && next.kills === best.kills);
  return {
    kind: "player",
    tie: tied,
    title: best.name,
    id: best.id,
    length: Math.round(best.length),
    rows: rank.snakes.map(presentRow),
    pairs: null,
  };
}

function packBody(snake, precise) {
  var pts = snake.points;
  if (!snake.alive || !pts.length) return [];
  var cap = 90;
  var stepN = Math.max(1, Math.ceil(pts.length / cap));
  var out = [];
  var num = precise
    ? function (v) { return Math.round(v * 10) / 10; }
    : function (v) { return Math.round(v); };
  for (var i = 0; i < pts.length; i += stepN) {
    out.push([num(pts[i].x), num(pts[i].y)]);
  }
  var tail = pts[0];
  var head = pts[pts.length - 1];
  if (out.length) {
    out[0] = [num(tail.x), num(tail.y)];
    out[out.length - 1] = [num(head.x), num(head.y)];
  }
  return out;
}

function snapshot(world, precise) {
  var num = precise
    ? function (v) { return Math.round(v * 10) / 10; }
    : function (v) { return Math.round(v); };
  return {
    t: "state",
    mode: world.mode,
    phase: world.phase,
    endless: !!world.endless,
    left: world.endless || world.left == null ? null : Math.max(0, world.left),
    arena: world.arenaRadius,
    winner: world.phase === "over" ? world.winner : null,
    foods: world.foods.map(function (f) {
      return [num(f.x), num(f.y), f.kind | 0];
    }),
    snakes: world.snakes.map(function (s) {
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        team: s.team,
        bot: !!s.isBot,
        x: num(s.x),
        y: num(s.y),
        angle: Math.round(s.angle * 1000) / 1000,
        speed: Math.round(currentSpeed(s)),
        alive: !!s.alive,
        length: precise ? Math.round(s.length * 10) / 10 : Math.round(s.length),
        boost: !!s.boost,
        grace: s.grace > 0,
        respawnIn: s.alive ? 0 : Math.max(0, Math.round(s.respawnIn * 10) / 10),
        kills: s.kills,
        cause: s.alive ? null : s.cause,
        killerId: s.alive ? null : s.killerId,
        body: packBody(s, !!precise),
      };
    }),
  };
}

var api = {
  CONFIG: CONFIG,
  CONTRA_COLORS: CONTRA_COLORS,
  PAIR_COLORS: PAIR_COLORS,
  PAIR_LABELS: PAIR_LABELS,
  createMatch: createMatch,
  step: step,
  setInput: setInput,
  snapshot: snapshot,
  rankings: rankings,
  decideWinner: decideWinner,
  dismissSnake: dismissSnake,
  pickColor: pickColor,
  safeColor: safeColor,
  currentSpeed: currentSpeed,
  wrapAngle: wrapAngle,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.SnakeSim = api;
