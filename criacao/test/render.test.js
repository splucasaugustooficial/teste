"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMatch, snapshot } = require("../www/js/sim.js");
const { presentView, drawWorld, drawMinimap } = require("../www/js/render.js");

function stub() {
  var ctx = new Proxy(
    {},
    {
      get: function (_target, prop) {
        if (prop === "canvas") return { width: 180, height: 180 };
        return function () {
          return ctx;
        };
      },
      set: function () {
        return true;
      },
    }
  );
  return ctx;
}

test("a extrapolação move a cobra viva e deixa a morta parada", () => {
  const world = createMatch({
    seed: 1,
    mode: "contra",
    players: [{ id: "p1", name: "Ana" }],
    fillBots: false,
    endless: true,
  });
  const snap = snapshot(world, false);
  snap.snakes[0].angle = 0;
  snap.snakes[0].speed = 100;
  const moved = presentView(snap, 100);
  assert.ok(moved.snakes[0].x > snap.snakes[0].x);
  const deadSnap = JSON.parse(JSON.stringify(snap));
  deadSnap.snakes[0].alive = false;
  const still = presentView(deadSnap, 100);
  assert.equal(still.snakes[0].x, deadSnap.snakes[0].x);
  const frozen = presentView(Object.assign({}, snap, { phase: "over" }), 500);
  assert.equal(frozen.snakes[0].x, snap.snakes[0].x);
});

test("desenhar o mundo e o minimapa não estoura", () => {
  const world = createMatch({
    seed: 3,
    mode: "dupla",
    players: [
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Bia" },
    ],
    fillBots: true,
    endless: true,
  });
  const view = presentView(snapshot(world, true), 0);
  const ctx = stub();
  drawWorld(ctx, view, { x: 0, y: 0, zoom: 0.6 }, 1000, { x: 0, y: 0, w: 800, h: 400 });
  drawWorld(ctx, view, { x: 10, y: -20, zoom: 1 }, 1000, { x: 400, y: 0, w: 400, h: 400 });
  drawMinimap(ctx, view, "p1");
  assert.equal(view.mode, "dupla");
  assert.ok(view.snakes.length >= 2);
});

test("cor estranha vinda da rede não passa", () => {
  const view = presentView(
    {
      phase: "playing",
      snakes: [{ id: "p1", name: "Ana", x: 0, y: 0, angle: 0, speed: 10, alive: true, color: "red;evil", body: [] }],
      foods: [],
    },
    0
  );
  assert.equal(view.snakes[0].color, "#3dff9a");
});
