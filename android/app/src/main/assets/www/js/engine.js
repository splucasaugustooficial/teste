/**
 * Motor determinístico de Cobra Arena (estilo snake.io).
 * Roda no browser e no Node (testes). Sem I/O, sem DOM.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CobraEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAU = Math.PI * 2;
  const MODES = { DUPLA: "dupla", CONTRA: "contra" };

  const DEFAULTS = {
    worldRadius: 1800,
    tickHz: 20,
    baseSpeed: 148,
    boostSpeed: 248,
    turnRate: 4.6,
    segmentGap: 7.2,
    baseRadius: 8.4,
    foodCount: 170,
    botCount: 5,
    boostDrainPerSec: 14,
    minLength: 28,
    startLength: 42,
    respawnSec: 3.2,
    matchSec: 180,
    magnetRadius: 38,
    maxPlayers: 8,
  };

  const SKINS = [
    { body: "#3ee0ff", edge: "#146a80", glow: "rgba(62,224,255,0.35)" },
    { body: "#b8ff3c", edge: "#4a7a12", glow: "rgba(184,255,60,0.32)" },
    { body: "#ff4d6d", edge: "#8a1830", glow: "rgba(255,77,109,0.32)" },
    { body: "#ffb020", edge: "#8a5a08", glow: "rgba(255,176,32,0.32)" },
    { body: "#c084ff", edge: "#4c2878", glow: "rgba(192,132,255,0.32)" },
    { body: "#5dffc2", edge: "#0f6a52", glow: "rgba(93,255,194,0.32)" },
    { body: "#ff7a3c", edge: "#7a3010", glow: "rgba(255,122,60,0.32)" },
    { body: "#7aa2ff", edge: "#203878", glow: "rgba(122,162,255,0.32)" },
  ];

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }
  function normAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function turnToward(from, to, max) {
    const d = normAngle(to - from);
    if (d > max) return from + max;
    if (d < -max) return from - max;
    return to;
  }
  function radiusFor(length) {
    return DEFAULTS.baseRadius + Math.sqrt(Math.max(0, length)) * 0.34;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInCircle(rng, radius, margin) {
    const r = Math.sqrt(rng()) * (radius - margin);
    const a = rng() * TAU;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function makeFood(rng, worldRadius) {
    const p = randomInCircle(rng, worldRadius, 40);
    const big = rng() < 0.08;
    return {
      x: p.x,
      y: p.y,
      value: big ? 8 : 1 + Math.floor(rng() * 3),
      hue: Math.floor(rng() * 360),
    };
  }

  function buildPath(x, y, dir, length, gap) {
    const parts = [];
    const n = Math.max(4, Math.ceil(length / gap) + 2);
    for (let i = 0; i < n; i++) {
      parts.push({
        x: x - Math.cos(dir) * gap * i,
        y: y - Math.sin(dir) * gap * i,
      });
    }
    return parts;
  }

  function assignTeam(index, mode, totalHumans) {
    if (mode !== MODES.DUPLA) return index;
    if (totalHumans <= 2) return 0;
    return index % 2;
  }

  function createSnake(opts) {
    const rng = opts.rng;
    const spawn = opts.x != null ? { x: opts.x, y: opts.y } : randomInCircle(rng, opts.worldRadius, 280);
    const dir = opts.dir != null ? opts.dir : rng() * TAU;
    const length = opts.length || DEFAULTS.startLength;
    return {
      id: opts.id,
      name: opts.name || "Cobra",
      color: opts.color != null ? opts.color : opts.id % SKINS.length,
      team: opts.team,
      bot: !!opts.bot,
      x: spawn.x,
      y: spawn.y,
      dir,
      want: dir,
      boost: false,
      alive: true,
      respawnIn: 0,
      length,
      score: 0,
      kills: 0,
      parts: buildPath(spawn.x, spawn.y, dir, length, DEFAULTS.segmentGap),
    };
  }

  function createGame(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const seed = o.seed == null ? 1 : o.seed >>> 0;
    const rng = mulberry32(seed);
    const mode = o.mode === MODES.DUPLA ? MODES.DUPLA : MODES.CONTRA;
    const humans = (o.players || []).slice(0, o.maxPlayers);
    const snakes = [];

    humans.forEach((p, i) => {
      snakes.push(
        createSnake({
          id: i,
          name: p.name || "Jogador " + (i + 1),
          color: p.color != null ? p.color : i,
          team: assignTeam(i, mode, humans.length),
          rng,
          worldRadius: o.worldRadius,
        })
      );
    });

    const botsNeeded =
      o.botCount == null
        ? humans.length <= 1
          ? 5
          : mode === MODES.DUPLA && humans.length <= 2
            ? 4
            : Math.max(0, 6 - humans.length)
        : o.botCount;

    for (let b = 0; b < botsNeeded; b++) {
      const id = snakes.length;
      const team =
        mode === MODES.DUPLA
          ? humans.length <= 2
            ? 1
            : id % 2
          : id;
      snakes.push(
        createSnake({
          id,
          name: "Bot " + (b + 1),
          color: id % SKINS.length,
          team,
          bot: true,
          rng,
          worldRadius: o.worldRadius,
        })
      );
    }

    const food = [];
    for (let i = 0; i < o.foodCount; i++) food.push(makeFood(rng, o.worldRadius));

    return {
      seed,
      rng,
      mode,
      worldRadius: o.worldRadius,
      tick: 0,
      time: 0,
      matchSec: o.matchSec,
      over: false,
      winner: null,
      events: [],
      snakes,
      food,
      config: o,
    };
  }

  function dropFoodFromSnake(state, snake, fraction) {
    const rng = state.rng;
    const n = Math.min(48, Math.max(4, Math.floor(snake.parts.length * fraction)));
    const step = Math.max(1, Math.floor(snake.parts.length / n));
    for (let i = 0; i < snake.parts.length; i += step) {
      const p = snake.parts[i];
      state.food.push({
        x: p.x + (rng() - 0.5) * 10,
        y: p.y + (rng() - 0.5) * 10,
        value: 2 + Math.floor(rng() * 3),
        hue: (SKINS[snake.color % SKINS.length] ? 40 : 40) + Math.floor(rng() * 80),
      });
    }
  }

  function killSnake(state, snake, killer) {
    if (!snake.alive) return;
    snake.alive = false;
    snake.boost = false;
    snake.respawnIn = state.config.respawnSec;
    dropFoodFromSnake(state, snake, 0.55);
    if (killer && killer.id !== snake.id && killer.alive) {
      killer.kills += 1;
      killer.score += 40 + Math.floor(snake.length);
      killer.length += Math.min(36, 10 + snake.length * 0.12);
      state.events.push({
        kind: "kill",
        killer: killer.id,
        victim: snake.id,
        tick: state.tick,
      });
    } else {
      state.events.push({ kind: "die", victim: snake.id, tick: state.tick });
    }
  }

  function respawnSnake(state, snake) {
    const p = randomInCircle(state.rng, state.worldRadius, 320);
    snake.x = p.x;
    snake.y = p.y;
    snake.dir = state.rng() * TAU;
    snake.want = snake.dir;
    snake.length = DEFAULTS.startLength;
    snake.alive = true;
    snake.respawnIn = 0;
    snake.parts = buildPath(snake.x, snake.y, snake.dir, snake.length, DEFAULTS.segmentGap);
  }

  function sameTeam(mode, a, b) {
    return mode === MODES.DUPLA && a.team === b.team;
  }

  function steerBot(state, snake) {
    let bestFood = null;
    let bestD = Infinity;
    for (let i = 0; i < state.food.length; i++) {
      const f = state.food[i];
      const d = dist2(snake.x, snake.y, f.x, f.y);
      if (d < bestD) {
        bestD = d;
        bestFood = f;
      }
    }

    let threat = null;
    let threatD = 220 * 220;
    let prey = null;
    let preyD = 260 * 260;
    for (let i = 0; i < state.snakes.length; i++) {
      const o = state.snakes[i];
      if (o.id === snake.id || !o.alive) continue;
      if (sameTeam(state.mode, snake, o)) continue;
      const d = dist2(snake.x, snake.y, o.x, o.y);
      if (o.length > snake.length * 1.15 && d < threatD) {
        threatD = d;
        threat = o;
      } else if (snake.length > o.length * 1.2 && d < preyD) {
        preyD = d;
        prey = o;
      }
    }

    let tx = snake.x + Math.cos(snake.dir) * 80;
    let ty = snake.y + Math.sin(snake.dir) * 80;
    if (threat) {
      tx = snake.x - (threat.x - snake.x);
      ty = snake.y - (threat.y - snake.y);
      snake.boost = threatD < 140 * 140 && snake.length > DEFAULTS.minLength + 8;
    } else if (prey && preyD < 180 * 180) {
      tx = prey.x;
      ty = prey.y;
      snake.boost = preyD < 90 * 90 && snake.length > DEFAULTS.minLength + 12;
    } else if (bestFood) {
      tx = bestFood.x;
      ty = bestFood.y;
      snake.boost = false;
    } else {
      snake.boost = false;
    }

    const edge = Math.hypot(snake.x, snake.y);
    if (edge > state.worldRadius - 160) {
      tx = -snake.x;
      ty = -snake.y;
      snake.boost = false;
    }
    snake.want = Math.atan2(ty - snake.y, tx - snake.x);
  }

  function eatNearby(state, snake) {
    const r = radiusFor(snake.length) + 6;
    const r2 = r * r;
    const mag2 = (r + state.config.magnetRadius) * (r + state.config.magnetRadius);
    for (let i = state.food.length - 1; i >= 0; i--) {
      const f = state.food[i];
      const d = dist2(snake.x, snake.y, f.x, f.y);
      if (d < r2) {
        snake.length += f.value;
        snake.score += f.value;
        state.food[i] = makeFood(state.rng, state.worldRadius);
      } else if (d < mag2) {
        const pull = 0.18;
        f.x = lerp(f.x, snake.x, pull);
        f.y = lerp(f.y, snake.y, pull);
      }
    }
  }

  function collide(state) {
    const snakes = state.snakes;
    for (let i = 0; i < snakes.length; i++) {
      const a = snakes[i];
      if (!a.alive) continue;
      const ar = radiusFor(a.length) * 0.78;
      for (let j = 0; j < snakes.length; j++) {
        if (i === j) continue;
        const b = snakes[j];
        if (!b.alive) continue;
        if (sameTeam(state.mode, a, b)) continue;
        const br = radiusFor(b.length) * 0.86;
        const hitR = ar + br;
        const hitR2 = hitR * hitR;
        const start = Math.min(4, b.parts.length);
        for (let k = start; k < b.parts.length; k += 2) {
          const p = b.parts[k];
          if (dist2(a.x, a.y, p.x, p.y) < hitR2) {
            killSnake(state, a, b);
            k = b.parts.length;
          }
        }
      }
    }
  }

  function teamScores(state) {
    const map = new Map();
    for (const s of state.snakes) {
      const key = state.mode === MODES.DUPLA ? s.team : s.id;
      const cur = map.get(key) || { team: key, score: 0, kills: 0, alive: 0, names: [] };
      cur.score += s.score;
      cur.kills += s.kills;
      if (s.alive) cur.alive += 1;
      if (!s.bot) cur.names.push(s.name);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score || b.kills - a.kills);
  }

  function maybeEnd(state) {
    if (state.over) return;
    if (state.time >= state.matchSec) {
      state.over = true;
      const board = teamScores(state);
      state.winner = board[0] || null;
      state.events.push({ kind: "end", reason: "tempo", winner: state.winner });
      return;
    }
    const livingTeams = new Set();
    for (const s of state.snakes) {
      if (s.alive && !s.bot) {
        livingTeams.add(state.mode === MODES.DUPLA ? s.team : s.id);
      }
    }
    const humans = state.snakes.filter((s) => !s.bot);
    if (humans.length >= 2 && livingTeams.size <= 1 && state.time > 4) {
      const onlyBotsLeft = livingTeams.size === 0;
      if (!onlyBotsLeft) {
        state.over = true;
        state.winner = teamScores(state)[0] || null;
        state.events.push({ kind: "end", reason: "eliminacao", winner: state.winner });
      }
    }
  }

  function stepSnake(state, snake, input, dt) {
    if (!snake.alive) {
      snake.respawnIn -= dt;
      if (snake.respawnIn <= 0) respawnSnake(state, snake);
      return;
    }
    if (snake.bot) steerBot(state, snake);
    else if (input) {
      if (typeof input.dir === "number" && !Number.isNaN(input.dir)) snake.want = input.dir;
      snake.boost = !!input.boost;
    }

    snake.dir = turnToward(snake.dir, snake.want, state.config.turnRate * dt);
    const boosting = snake.boost && snake.length > DEFAULTS.minLength + 1;
    snake.boost = boosting;
    const speed = boosting ? state.config.boostSpeed : state.config.baseSpeed;
    if (boosting) {
      snake.length = Math.max(DEFAULTS.minLength, snake.length - state.config.boostDrainPerSec * dt);
      if (state.tick % 4 === 0) {
        const tail = snake.parts[snake.parts.length - 1];
        if (tail) {
          state.food.push({
            x: tail.x,
            y: tail.y,
            value: 1,
            hue: 48,
          });
          if (state.food.length > state.config.foodCount + 40) state.food.shift();
        }
      }
    }

    snake.x += Math.cos(snake.dir) * speed * dt;
    snake.y += Math.sin(snake.dir) * speed * dt;

    const edge = Math.hypot(snake.x, snake.y);
    if (edge > state.worldRadius - 8) {
      killSnake(state, snake, null);
      return;
    }

    const gap = DEFAULTS.segmentGap;
    const head = snake.parts[0];
    if (!head || dist2(head.x, head.y, snake.x, snake.y) >= gap * gap * 0.85) {
      snake.parts.unshift({ x: snake.x, y: snake.y });
    } else {
      head.x = snake.x;
      head.y = snake.y;
    }
    const need = Math.max(4, Math.ceil(snake.length / gap) + 2);
    while (snake.parts.length > need) snake.parts.pop();
    while (snake.parts.length < need) {
      const last = snake.parts[snake.parts.length - 1];
      snake.parts.push({ x: last.x, y: last.y });
    }

    eatNearby(state, snake);
  }

  function step(state, inputs, dt) {
    if (state.over) return state;
    state.events = [];
    state.tick += 1;
    state.time += dt;
    const map = inputs || {};
    for (let i = 0; i < state.snakes.length; i++) {
      stepSnake(state, state.snakes[i], map[state.snakes[i].id], dt);
    }
    collide(state);
    maybeEnd(state);
    return state;
  }

  function snapshot(state) {
    return {
      tick: state.tick,
      time: state.time,
      over: state.over,
      winner: state.winner,
      mode: state.mode,
      worldRadius: state.worldRadius,
      matchSec: state.matchSec,
      events: state.events,
      food: state.food.map((f) => [round(f.x), round(f.y), f.value, f.hue]),
      snakes: state.snakes.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        team: s.team,
        bot: s.bot,
        x: round(s.x),
        y: round(s.y),
        dir: Math.round(s.dir * 1000) / 1000,
        boost: s.boost,
        alive: s.alive,
        respawnIn: Math.round(s.respawnIn * 100) / 100,
        length: Math.round(s.length * 10) / 10,
        score: s.score,
        kills: s.kills,
        parts: s.parts.map((p) => [round(p.x), round(p.y)]),
      })),
    };
  }

  function applySnapshot(state, snap) {
    state.tick = snap.tick;
    state.time = snap.time;
    state.over = snap.over;
    state.winner = snap.winner;
    state.mode = snap.mode;
    state.worldRadius = snap.worldRadius;
    state.matchSec = snap.matchSec;
    state.events = snap.events || [];
    state.food = (snap.food || []).map((f) => ({
      x: f[0],
      y: f[1],
      value: f[2],
      hue: f[3],
    }));
    const byId = new Map(state.snakes.map((s) => [s.id, s]));
    state.snakes = (snap.snakes || []).map((s) => {
      const prev = byId.get(s.id) || {};
      return Object.assign(prev, s, {
        parts: (s.parts || []).map((p) => ({ x: p[0], y: p[1] })),
      });
    });
    return state;
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  function radiusOf(snake) {
    return radiusFor(snake.length);
  }

  return {
    MODES,
    SKINS,
    DEFAULTS,
    createGame,
    step,
    snapshot,
    applySnapshot,
    teamScores,
    radiusOf,
    radiusFor,
    assignTeam,
    sameTeam,
    killSnake,
    collide,
    dist2,
    clamp,
    lerp,
    normAngle,
  };
});
