import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let Eng = require("../web/js/engine.js");
if (!Eng || typeof Eng.createGame !== "function") {
  Eng = globalThis.CobraEngine;
}
if (!Eng || typeof Eng.createGame !== "function") {
  throw new Error("engine não carregou: " + pathToFileURL(path.resolve("web/js/engine.js")));
}

function runTicks(game, inputs, n, dt = 0.05) {
  for (let i = 0; i < n; i++) Eng.step(game, inputs, dt);
  return game;
}

test("cobra cresce ao comer comida no mesmo ponto", () => {
  const game = Eng.createGame({
    seed: 7,
    mode: "contra",
    players: [{ name: "A" }],
    botCount: 0,
    foodCount: 0,
  });
  const s = game.snakes[0];
  const before = s.length;
  game.food.push({ x: s.x, y: s.y, value: 10, hue: 10 });
  Eng.step(game, { 0: { dir: s.dir, boost: false } }, 0.05);
  assert.ok(s.length >= before + 10);
  assert.ok(s.score >= 10);
});

test("contra: cabeça no corpo inimigo elimina", () => {
  const game = Eng.createGame({
    seed: 3,
    mode: "contra",
    players: [{ name: "A" }, { name: "B" }],
    botCount: 0,
    foodCount: 0,
  });
  const a = game.snakes[0];
  const b = game.snakes[1];
  a.alive = true;
  a.x = 96;
  a.y = 0;
  a.parts = [{ x: 96, y: 0 }];
  b.alive = true;
  b.x = 200;
  b.y = 0;
  b.parts = [];
  for (let i = 0; i < 24; i++) b.parts.push({ x: i * 8, y: 0 });
  Eng.collide(game);
  assert.equal(a.alive, false);
  assert.ok(b.kills >= 1);
});

test("dupla: aliado não mata aliado", () => {
  const game = Eng.createGame({
    seed: 3,
    mode: "dupla",
    players: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    botCount: 0,
    foodCount: 0,
  });
  assert.equal(game.snakes[0].team, game.snakes[2].team);
  assert.notEqual(game.snakes[0].team, game.snakes[1].team);
  const a = game.snakes[0];
  const mate = game.snakes[2];
  a.x = 40;
  a.y = 0;
  a.alive = true;
  mate.x = 200;
  mate.y = 0;
  mate.parts = [];
  for (let i = 0; i < 20; i++) mate.parts.push({ x: i * 8, y: 0 });
  Eng.step(game, {}, 0.05);
  assert.equal(a.alive, true);
});

test("turbo reduz tamanho até o mínimo", () => {
  const game = Eng.createGame({
    seed: 1,
    mode: "contra",
    players: [{ name: "A" }],
    botCount: 0,
    foodCount: 0,
  });
  const s = game.snakes[0];
  s.length = 80;
  const before = s.length;
  runTicks(game, { 0: { dir: s.dir, boost: true } }, 20);
  assert.ok(s.length < before);
  s.length = Eng.DEFAULTS.minLength + 0.2;
  runTicks(game, { 0: { dir: s.dir, boost: true } }, 10);
  assert.ok(s.length >= Eng.DEFAULTS.minLength - 0.05);
});

test("sair da arena elimina", () => {
  const game = Eng.createGame({
    seed: 1,
    mode: "contra",
    players: [{ name: "A" }],
    botCount: 0,
    foodCount: 0,
  });
  const s = game.snakes[0];
  s.x = game.worldRadius - 4;
  s.y = 0;
  s.dir = 0;
  s.want = 0;
  Eng.step(game, { 0: { dir: 0, boost: false } }, 0.2);
  assert.equal(s.alive, false);
});

test("snapshot vai e volta sem perder placar", () => {
  const game = Eng.createGame({
    seed: 9,
    mode: "dupla",
    players: [{ name: "A" }, { name: "B" }],
    botCount: 1,
  });
  game.snakes[0].score = 33;
  const snap = Eng.snapshot(game);
  const other = Eng.createGame({ seed: 1, mode: "contra", players: [{ name: "Z" }], botCount: 0 });
  Eng.applySnapshot(other, snap);
  assert.equal(other.mode, "dupla");
  assert.equal(other.snakes[0].score, 33);
  assert.equal(other.snakes[0].name, "A");
});

test("dois humanos em dupla ficam no mesmo time contra bots", () => {
  const game = Eng.createGame({
    seed: 2,
    mode: "dupla",
    players: [{ name: "A" }, { name: "B" }],
    botCount: 3,
  });
  assert.equal(game.snakes[0].team, 0);
  assert.equal(game.snakes[1].team, 0);
  assert.ok(game.snakes.some((s) => s.bot && s.team === 1));
});

test("partida acaba por tempo e elege maior placar", () => {
  const game = Eng.createGame({
    seed: 4,
    mode: "contra",
    players: [{ name: "A" }, { name: "B" }],
    botCount: 0,
    matchSec: 0.05,
  });
  game.snakes[1].score = 99;
  Eng.step(game, {}, 0.06);
  assert.equal(game.over, true);
  assert.equal(game.winner.score, 99);
});
