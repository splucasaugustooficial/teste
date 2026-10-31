"use strict";

var SimRef = typeof window !== "undefined" ? window.SnakeSim : null;

var FOOD_COLORS = ["#c6ff4a", "#4cc9f0", "#ff5d8f", "#ffd60a"];

function safeColor(c) {
  if (SimRef && SimRef.safeColor) return SimRef.safeColor(c);
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#3dff9a";
}

function presentView(snap, ageMs) {
  if (!snap) return null;
  var dt = snap.phase === "over" ? 0 : Math.min(0.12, Math.max(0, (ageMs || 0) / 1000));
  var snakes = (snap.snakes || []).map(function (s) {
    if (!s || !s.alive || !isFinite(s.x) || !isFinite(s.y)) {
      return Object.assign({}, s, { color: safeColor(s && s.color) });
    }
    var d = (Number(s.speed) || 0) * dt;
    var ox = Math.cos(Number(s.angle) || 0) * d;
    var oy = Math.sin(Number(s.angle) || 0) * d;
    var body = [];
    var raw = s.body || [];
    for (var i = 0; i < raw.length; i++) {
      if (!raw[i] || raw[i].length < 2) continue;
      body.push([raw[i][0] + ox, raw[i][1] + oy]);
    }
    return Object.assign({}, s, {
      x: s.x + ox,
      y: s.y + oy,
      body: body,
      color: safeColor(s.color),
    });
  });
  return Object.assign({}, snap, { snakes: snakes });
}

function labelOf(name) {
  return String(name == null ? "" : name).replace(/[\u0000-\u001f]/g, "").slice(0, 16);
}

function drawSnake(ctx, snake, camera, time) {
  if (!snake || !snake.alive) return;
  if (!isFinite(snake.x) || !isFinite(snake.y)) return;
  if (snake.grace && Math.floor(time / 120) % 2 === 0) return;
  var color = safeColor(snake.color);
  var body = snake.body || [];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  if (body.length) {
    ctx.beginPath();
    ctx.moveTo(body[0][0], body[0][1]);
    for (var i = 1; i < body.length; i++) ctx.lineTo(body[i][0], body[i][1]);
    ctx.lineTo(snake.x, snake.y);
    if (snake.boost) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 26;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(snake.x, snake.y, snake.boost ? 13 : 11.5, 0, Math.PI * 2);
  ctx.fill();
  var ex = Math.cos(Number(snake.angle) || 0);
  var ey = Math.sin(Number(snake.angle) || 0);
  var px = -ey;
  var py = ex;
  for (var side = -1; side <= 1; side += 2) {
    var eyeX = snake.x + ex * 6 + px * side * 4.2;
    var eyeY = snake.y + ey * 6 + py * side * 4.2;
    ctx.beginPath();
    ctx.fillStyle = "#f7fbff";
    ctx.arc(eyeX, eyeY, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#102033";
    ctx.arc(eyeX + ex * 1.1, eyeY + ey * 1.1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  var name = labelOf(snake.name);
  if (name && camera && camera.zoom) {
    ctx.save();
    ctx.translate(snake.x, snake.y);
    ctx.scale(1 / camera.zoom, 1 / camera.zoom);
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.strokeText(name, 0, -20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, 0, -20);
    ctx.restore();
  }
  ctx.restore();
}

function drawWorld(ctx, view, camera, time, viewport) {
  if (!ctx || !view || !camera || !viewport) return;
  var x = viewport.x;
  var y = viewport.y;
  var w = viewport.w;
  var h = viewport.h;
  if (!(w > 0) || !(h > 0)) return;
  var arena = view.arena || 2400;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  var bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, "#16385a");
  bg.addColorStop(1, "#070d18");
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  var halfW = w / 2 / camera.zoom + 80;
  var halfH = h / 2 / camera.zoom + 80;
  var minX = camera.x - halfW;
  var maxX = camera.x + halfW;
  var minY = camera.y - halfH;
  var maxY = camera.y + halfH;
  var grid = 78;
  ctx.fillStyle = "rgba(186, 214, 255, 0.16)";
  var gx0 = Math.floor(minX / grid) * grid;
  var gy0 = Math.floor(minY / grid) * grid;
  for (var gx = gx0; gx <= maxX; gx += grid) {
    for (var gy = gy0; gy <= maxY; gy += grid) {
      if (gx * gx + gy * gy > arena * arena) continue;
      ctx.fillRect(gx, gy, 2.4, 2.4);
    }
  }

  ctx.beginPath();
  ctx.arc(0, 0, arena, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(8, 22, 44, 0.55)";
  ctx.fill();
  ctx.lineWidth = 28 / Math.max(camera.zoom, 0.35);
  ctx.strokeStyle = "rgba(61, 255, 154, 0.18)";
  ctx.stroke();
  ctx.lineWidth = 6 / Math.max(camera.zoom, 0.35);
  ctx.strokeStyle = "rgba(190, 255, 220, 0.85)";
  ctx.stroke();

  var foods = view.foods || [];
  for (var f = 0; f < foods.length; f++) {
    var food = foods[f];
    if (!food || food.length < 2 || !isFinite(food[0]) || !isFinite(food[1])) continue;
    if (food[0] < minX - 20 || food[0] > maxX + 20 || food[1] < minY - 20 || food[1] > maxY + 20) continue;
    var pulse = 1 + Math.sin(time / 190 + food[0] * 0.02) * 0.18;
    ctx.beginPath();
    ctx.fillStyle = FOOD_COLORS[(food[2] || 0) % FOOD_COLORS.length];
    ctx.arc(food[0], food[1], 6.2 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  var snakes = view.snakes || [];
  for (var s = 0; s < snakes.length; s++) drawSnake(ctx, snakes[s], camera, time);
  ctx.restore();
  ctx.restore();
}

function drawMinimap(ctx, view, youId) {
  if (!ctx || !view || !ctx.canvas) return;
  var w = ctx.canvas.width;
  var h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(5, 10, 20, 0.55)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(61, 255, 154, 0.8)";
  ctx.stroke();
  var arena = view.arena || 2400;
  var scale = (w / 2 - 8) / arena;
  var snakes = view.snakes || [];
  for (var i = 0; i < snakes.length; i++) {
    var s = snakes[i];
    if (!s || !s.alive || !isFinite(s.x) || !isFinite(s.y)) continue;
    ctx.beginPath();
    ctx.fillStyle = safeColor(s.color);
    ctx.arc(w / 2 + s.x * scale, h / 2 + s.y * scale, s.id === youId ? 4.2 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

var api = {
  FOOD_COLORS: FOOD_COLORS,
  presentView: presentView,
  drawWorld: drawWorld,
  drawMinimap: drawMinimap,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.SnakeRender = api;
