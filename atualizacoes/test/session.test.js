"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanName,
  createHostSession,
  createClientSession,
  hostSetMode,
  hostRename,
  hostSetBots,
  hostMove,
  hostAddLocal,
  hostStart,
  hostPlayAgain,
  hostPeerOpen,
  hostPeerClose,
  hostPeerMessage,
  hostTick,
  clientHello,
  clientReceive,
  clientInput,
  lobbyPlayers,
  localHumanIds,
} = require("../www/js/session.js");

function feed(client, outs, peerId) {
  for (const o of outs) {
    if (o.to === "*" || o.to === peerId) clientReceive(client, o.msg);
  }
}

test("nomes entram limpos e com tamanho limitado", () => {
  assert.equal(cleanName("  Ana   Luz  "), "Ana Luz");
  assert.equal(cleanName(""), "Jogador");
  assert.equal(cleanName("a\nb"), "ab");
  assert.equal(Array.from(cleanName("🐍".repeat(20))).length, 16);
  assert.equal(cleanName(12), "Jogador");
});

test("o primeiro da sala recebe o segundo e os dois ficam no mesmo par", () => {
  const host = createHostSession({ name: "Ana", mode: "dupla", fillBots: false, seed: 3 });
  hostPeerOpen(host, "s1");
  const hello = hostPeerMessage(host, "s1", { t: "hello", v: 1, name: "  Bia " });
  const client = createClientSession({ name: "Bia" });
  feed(client, hello, "s1");
  assert.equal(client.youId, "p2");
  assert.equal(client.phase, "lobby");
  assert.equal(client.players.length, 2);
  assert.equal(client.mode, "dupla");
  assert.equal(client.players[0].pair, 1);
  assert.equal(client.players[1].pair, 1);
  assert.equal(client.players[1].name, "Bia");

  const again = hostPeerMessage(host, "s1", { t: "hello", v: 1, name: "Outra" });
  assert.equal(again.length, 0);
  assert.equal(host.players.length, 2);
});

test("sala cheia, partida já começada e versão errada são recusadas", () => {
  const host = createHostSession({ name: "Ana", mode: "contra", fillBots: false, seed: 1 });
  for (let i = 0; i < 7; i++) {
    const id = "s" + i;
    hostPeerOpen(host, id);
    const outs = hostPeerMessage(host, id, { t: "hello", v: 1, name: "P" + i });
    assert.equal(outs[0].msg.t, "welcome");
  }
  hostPeerOpen(host, "extra");
  const full = hostPeerMessage(host, "extra", { t: "hello", v: 1, name: "Cheio" });
  assert.equal(full[0].msg.t, "full");
  assert.equal(host.players.length, 8);

  const started = createHostSession({ name: "Ana", mode: "contra", fillBots: false, seed: 1 });
  hostStart(started);
  hostPeerOpen(started, "s1");
  const busy = hostPeerMessage(started, "s1", { t: "hello", v: 1, name: "Bia" });
  assert.equal(busy[0].msg.t, "busy");

  const old = createHostSession({ name: "Ana", mode: "contra", fillBots: false, seed: 1 });
  hostPeerOpen(old, "s9");
  const bye = hostPeerMessage(old, "s9", { t: "hello", v: 99, name: "Velho" });
  assert.equal(bye[0].msg.t, "bye");
});

test("trocar a ordem muda os pares da dupla", () => {
  const host = createHostSession({ name: "Ana", mode: "dupla", fillBots: false, seed: 1 });
  hostPeerOpen(host, "s1");
  hostPeerMessage(host, "s1", { t: "hello", v: 1, name: "Bia" });
  hostPeerOpen(host, "s2");
  hostPeerMessage(host, "s2", { t: "hello", v: 1, name: "Caio" });
  let view = lobbyPlayers(host);
  assert.deepEqual(
    view.map((p) => p.name),
    ["Ana", "Bia", "Caio"]
  );
  assert.equal(view[0].pair, 1);
  assert.equal(view[2].pair, 2);
  hostMove(host, "p2", 1);
  view = lobbyPlayers(host);
  assert.deepEqual(
    view.map((p) => p.name),
    ["Ana", "Caio", "Bia"]
  );
  assert.equal(view[1].name, "Caio");
  assert.equal(view[1].team, 0);
  assert.equal(view[2].team, 1);
});

test("iniciar manda o estado e a mira do convidado entra na simulação", () => {
  const host = createHostSession({ name: "Ana", mode: "dupla", fillBots: true, seed: 5 });
  hostPeerOpen(host, "s1");
  hostPeerMessage(host, "s1", { t: "hello", v: 1, name: "Bia" });
  const client = createClientSession({ name: "Bia" });
  const started = hostStart(host);
  feed(client, started, "s1");
  assert.equal(client.phase, "playing");
  assert.ok(client.snapshot);
  assert.equal(client.snapshot.snakes.length, 6);
  const ana = host.world.snakes.find((s) => s.id === "p1");
  const bia = host.world.snakes.find((s) => s.id === "p2");
  assert.equal(ana.team, 0);
  assert.equal(bia.team, 0);
  assert.equal(bia.isBot, false);

  const input = clientInput(1.2, true);
  hostPeerMessage(host, "s1", input);
  assert.equal(bia.targetAngle, 1.2);
  assert.equal(bia.boost, true);

  hostPeerMessage(host, "s1", { t: "input", angle: "nope", boost: 1 });
  hostPeerMessage(host, "fantasma", { t: "hello", v: 1, name: "Z" });
  hostPeerMessage(host, "s1", null);
  assert.equal(bia.boost, true);
});

test("o relógio do anfitrião encerra a partida e o convidado vê o vencedor", () => {
  const host = createHostSession({ name: "Ana", mode: "contra", fillBots: false, seed: 2 });
  host.world = null;
  const started = hostStart(host);
  const client = createClientSession({ name: "Ana" });
  clientReceive(client, { t: "welcome", v: 1, id: "p1", name: "Ana" });
  feed(client, started, "*");
  host.world.left = 0.02;
  const outs = hostTick(host, 1 / 20);
  assert.equal(host.phase, "over");
  assert.ok(host.result);
  feed(client, outs, "*");
  assert.equal(client.phase, "over");
  assert.ok(client.result);
  assert.equal(client.result.kind, "player");
});

test("jogar de novo volta ao lobby sem os bots", () => {
  const host = createHostSession({ name: "Ana", mode: "contra", fillBots: true, seed: 2 });
  hostStart(host);
  assert.ok(host.world.snakes.length > 1);
  const outs = hostPlayAgain(host);
  assert.equal(host.phase, "lobby");
  assert.equal(host.world, null);
  assert.equal(outs[0].msg.t, "lobby");
  assert.equal(outs[0].msg.players.length, 1);
});

test("sair no meio tira a cobra e avisa o lobby se a partida não começou", () => {
  const host = createHostSession({ name: "Ana", mode: "dupla", fillBots: false, seed: 1 });
  hostPeerOpen(host, "s1");
  hostPeerMessage(host, "s1", { t: "hello", v: 1, name: "Bia" });
  const closed = hostPeerClose(host, "s1");
  assert.equal(host.players.length, 1);
  assert.equal(closed[0].msg.t, "lobby");
  assert.equal(closed[0].msg.players.length, 1);

  hostPeerOpen(host, "s2");
  hostPeerMessage(host, "s2", { t: "hello", v: 1, name: "Caio" });
  hostStart(host);
  const gone = hostPeerClose(host, "s2");
  assert.ok(gone.some((o) => o.msg.t === "state"));
  assert.equal(
    host.world.snakes.some((s) => s.name === "Caio"),
    false
  );
});

test("modo e bots só mudam antes de começar", () => {
  const host = createHostSession({ name: "Ana", mode: "contra", fillBots: true, seed: 1 });
  const changed = hostSetMode(host, "dupla");
  assert.equal(host.mode, "dupla");
  assert.equal(changed[0].msg.mode, "dupla");
  hostSetBots(host, false);
  assert.equal(host.fillBots, false);
  const renamed = hostRename(host, "  Ana Luz  ");
  assert.equal(renamed[0].msg.players[0].name, "Ana Luz");
  hostStart(host);
  assert.equal(hostSetMode(host, "contra").length, 0);
  assert.equal(host.mode, "dupla");
  assert.equal(hostRename(host, "Outro").length, 0);
});

test("neste aparelho os dois controles locais existem", () => {
  const host = createHostSession({ name: "Ana", mode: "dupla", fillBots: false, seed: 1 });
  hostAddLocal(host, "Bia");
  assert.deepEqual(localHumanIds(host), ["p1", "p2"]);
  const hello = clientHello(createClientSession({ name: "  " }));
  assert.equal(hello.name, "Jogador");
  assert.equal(hello.v, 1);
});

test("cliente ignora estado inchado", () => {
  const client = createClientSession({ name: "Ana" });
  clientReceive(client, { t: "welcome", v: 1, id: "p1", name: "Ana" });
  clientReceive(client, {
    t: "state",
    phase: "playing",
    snakes: new Array(30).fill({ id: "x" }),
    foods: [],
  });
  assert.equal(client.snapshot, null);
  clientReceive(client, { t: "full", reason: "A sala está cheia." });
  assert.equal(client.phase, "error");
  assert.equal(client.error, "A sala está cheia.");
});
