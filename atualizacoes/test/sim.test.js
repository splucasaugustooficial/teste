"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIG,
  createMatch,
  step,
  setInput,
  snapshot,
  decideWinner,
} = require("../www/js/sim.js");

function solo(extra) {
  return createMatch(
    Object.assign(
      {
        seed: 1,
        mode: "contra",
        players: [{ id: "p1", name: "Ana" }],
        fillBots: false,
        roundSeconds: 30,
      },
      extra || {}
    )
  );
}

test("comer aumenta o tamanho e conta o alimento", () => {
  const world = solo();
  const s = world.snakes[0];
  const food = world.foods[0];
  s.x = food.x;
  s.y = food.y;
  const before = s.length;
  step(world, 1 / 60);
  assert.ok(s.length > before);
  assert.equal(s.eaten, 1);
  assert.ok(world.foods.length >= CONFIG.foodTarget - 1);
});

test("impulso anda mais e gasta corpo", () => {
  function travel(boost) {
    const world = solo();
    const s = world.snakes[0];
    s.x = 0;
    s.y = 0;
    s.angle = 0;
    s.targetAngle = 0;
    s.length = 80;
    s.boost = boost;
    step(world, 1 / 60);
    return s.x;
  }
  assert.ok(travel(true) > travel(false) * 1.4);

  const world = solo();
  const s = world.snakes[0];
  s.length = 80;
  s.angle = 0;
  s.targetAngle = 0;
  for (let i = 0; i < 60; i++) {
    world.foods.length = 0;
    setInput(world, "p1", 0, true);
    step(world, 1 / 60);
  }
  assert.ok(s.length < 70, "tamanho depois do impulso: " + s.length);
  assert.ok(s.x > CONFIG.baseSpeed * 0.8);
});

test("a curva é limitada num único quadro", () => {
  const world = solo();
  const s = world.snakes[0];
  s.angle = 0;
  s.targetAngle = Math.PI;
  step(world, 1 / 60);
  assert.ok(s.angle > CONFIG.turnRate / 60 * 0.9);
  assert.ok(s.angle < CONFIG.turnRate / 60);
});

test("bater na borda mata e espalha comida", () => {
  const world = solo();
  const s = world.snakes[0];
  s.x = world.arenaRadius - CONFIG.headRadius - 2;
  s.y = 0;
  s.angle = 0;
  s.targetAngle = 0;
  const foods = world.foods.length;
  step(world, 1 / 60);
  assert.equal(s.alive, false);
  assert.equal(s.cause, "wall");
  assert.ok(world.foods.length > foods);
});

test("no contra, encostar no corpo mata e dá o abate a quem foi atingido", () => {
  const world = createMatch({
    seed: 2,
    mode: "contra",
    players: [
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Bia" },
    ],
    fillBots: false,
  });
  const a = world.snakes[0];
  const b = world.snakes[1];
  const point = b.points[8];
  a.x = point.x;
  a.y = point.y;
  a.angle = 0;
  a.targetAngle = 0;
  step(world, 1 / 60);
  assert.equal(a.alive, false);
  assert.equal(a.cause, "snake");
  assert.equal(a.killerId, "p2");
  assert.equal(b.alive, true);
  assert.equal(b.kills, 1);
});

test("na dupla o par atravessa sem morrer", () => {
  const world = createMatch({
    seed: 2,
    mode: "dupla",
    players: [
      { id: "p1", name: "Ana", team: 0 },
      { id: "p2", name: "Bia", team: 0 },
    ],
    fillBots: false,
  });
  const a = world.snakes[0];
  const b = world.snakes[1];
  const point = b.points[8];
  a.x = point.x;
  a.y = point.y;
  step(world, 1 / 60);
  assert.equal(a.alive, true);
  assert.equal(b.alive, true);
  assert.equal(b.kills, 0);
});

test("na dupla o outro par mata", () => {
  const world = createMatch({
    seed: 2,
    mode: "dupla",
    players: [
      { id: "p1", name: "Ana", team: 0 },
      { id: "p2", name: "Bia", team: 1 },
    ],
    fillBots: false,
  });
  const a = world.snakes[0];
  const b = world.snakes[1];
  const point = b.points[8];
  a.x = point.x;
  a.y = point.y;
  step(world, 1 / 60);
  assert.equal(a.alive, false);
  assert.equal(b.kills, 1);
});

test("no contra, mesmo time numérico ainda mata", () => {
  const world = createMatch({
    seed: 2,
    mode: "contra",
    players: [
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Bia" },
    ],
    fillBots: false,
  });
  const a = world.snakes[0];
  const b = world.snakes[1];
  a.team = 0;
  b.team = 0;
  const point = b.points[8];
  a.x = point.x;
  a.y = point.y;
  step(world, 1 / 60);
  assert.equal(a.alive, false);
});

test("cruzar o próprio corpo não mata", () => {
  const world = solo();
  const s = world.snakes[0];
  s.points[4].x = s.x;
  s.points[4].y = s.y;
  step(world, 1 / 60);
  assert.equal(s.alive, true);
});

test("proteção depois de nascer impede a morte imediata", () => {
  const world = createMatch({
    seed: 2,
    mode: "contra",
    players: [
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Bia" },
    ],
    fillBots: false,
  });
  const a = world.snakes[0];
  const b = world.snakes[1];
  a.grace = 1;
  const point = b.points[8];
  a.x = point.x;
  a.y = point.y;
  step(world, 1 / 60);
  assert.equal(a.alive, true);
});

test("quem morre volta depois de 3 segundos", () => {
  const world = solo({ roundSeconds: 30 });
  const s = world.snakes[0];
  s.x = world.arenaRadius;
  s.y = 0;
  s.angle = 0;
  s.targetAngle = 0;
  step(world, 1 / 60);
  assert.equal(s.alive, false);
  for (let i = 0; i < 60 * 3 + 5; i++) step(world, 1 / 60);
  assert.equal(s.alive, true);
  assert.ok(s.grace > 0);
  assert.ok(Math.hypot(s.x, s.y) < world.arenaRadius);
});

test("o tempo acaba e a maior cobra vence no contra", () => {
  const world = createMatch({
    seed: 4,
    mode: "contra",
    roundSeconds: 0.05,
    players: [
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Bia" },
    ],
    fillBots: false,
  });
  world.snakes[0].length = 10;
  world.snakes[1].length = 80;
  step(world, 0.2);
  assert.equal(world.phase, "over");
  assert.equal(world.winner.kind, "player");
  assert.equal(world.winner.id, "p2");
  assert.equal(world.winner.tie, false);
});

test("na dupla vence o par com mais tamanho somado", () => {
  const world = createMatch({
    seed: 4,
    mode: "dupla",
    roundSeconds: 0.05,
    players: [
      { id: "p1", name: "Ana", team: 0 },
      { id: "p2", name: "Bia", team: 0 },
      { id: "p3", name: "Caio", team: 1 },
      { id: "p4", name: "Duda", team: 1 },
    ],
    fillBots: false,
  });
  world.snakes[0].length = 10;
  world.snakes[1].length = 10;
  world.snakes[2].length = 40;
  world.snakes[3].length = 40;
  step(world, 0.2);
  assert.equal(world.phase, "over");
  assert.equal(world.winner.kind, "pair");
  assert.equal(world.winner.team, 1);
  assert.ok(world.winner.title.indexOf("Caio") >= 0);
  assert.ok(world.winner.title.indexOf("Duda") >= 0);
});

test("empate quando o tamanho e os abates são iguais", () => {
  const world = solo({ roundSeconds: 1 });
  world.left = 0.01;
  world.snakes.push({
    id: "p2",
    name: "Bia",
    color: "#ffffff",
    team: null,
    isBot: false,
    x: 100,
    y: 100,
    angle: 0,
    targetAngle: 0,
    length: world.snakes[0].length,
    alive: true,
    boost: false,
    grace: 0,
    respawnIn: 0,
    kills: 0,
    eaten: 0,
    points: [],
    thinkIn: 10,
    inputAge: 0,
    cause: null,
    killerId: null,
  });
  const winner = decideWinner(world);
  assert.equal(winner.tie, true);
});

test("bots completam pares e a simulação não estoura", () => {
  const world = createMatch({
    seed: 9,
    mode: "dupla",
    players: [{ id: "p1", name: "Ana" }],
    fillBots: true,
    botTarget: 6,
    endless: true,
  });
  assert.equal(world.snakes.length, 6);
  assert.equal(world.snakes[0].team, 0);
  assert.equal(world.snakes[1].team, 0);
  assert.equal(world.snakes[1].isBot, true);
  assert.notEqual(world.snakes[2].team, 0);
  for (let i = 0; i < 180; i++) step(world, 1 / 60);
  assert.equal(world.phase, "playing");
  for (const s of world.snakes) {
    if (!s.alive) continue;
    assert.ok(Math.hypot(s.x, s.y) <= world.arenaRadius + 1);
  }
  const snap = snapshot(world, false);
  assert.equal(snap.t, "state");
  assert.equal(snap.snakes.length, 6);
  assert.ok(snap.foods.length >= CONFIG.foodTarget);
  assert.equal(snap.endless, true);
});

test("cobra morta não come", () => {
  const world = solo();
  const s = world.snakes[0];
  s.alive = false;
  const food = world.foods[0];
  s.x = food.x;
  s.y = food.y;
  const eaten = s.eaten;
  step(world, 1 / 60);
  assert.equal(s.eaten, eaten);
});

test("entrada inválida não gira a cobra", () => {
  const world = solo();
  const s = world.snakes[0];
  const angle = s.targetAngle;
  setInput(world, "p1", NaN, false);
  setInput(world, "ninguem", 1, true);
  assert.equal(s.targetAngle, angle);
  assert.equal(s.boost, false);
});
