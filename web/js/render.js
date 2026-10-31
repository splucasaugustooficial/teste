(function (root) {
  "use strict";
  const Eng = root.CobraEngine;

  function createRenderer(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    let w = 1;
    let h = 1;
    let dpr = 1;
    const cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
    let shake = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function follow(targets) {
      if (!targets.length) return;
      let sx = 0;
      let sy = 0;
      let maxLen = 0;
      for (const t of targets) {
        sx += t.x;
        sy += t.y;
        maxLen = Math.max(maxLen, t.length || 0);
      }
      cam.tx = sx / targets.length;
      cam.ty = sy / targets.length;
      const spread =
        targets.length > 1
          ? Math.max(
              220,
              Math.hypot(targets[0].x - targets[targets.length - 1].x, targets[0].y - targets[targets.length - 1].y)
            )
          : 0;
      const zoomOut = 0.72 + clamp(maxLen / 220, 0, 0.45) + clamp(spread / 1400, 0, 0.35);
      cam.tz = 1 / zoomOut;
    }

    function clamp(v, a, b) {
      return v < a ? a : v > b ? b : v;
    }

    function worldToScreen(x, y) {
      return {
        x: (x - cam.x) * cam.z + w / 2,
        y: (y - cam.y) * cam.z + h / 2,
      };
    }

    function drawBackground(state) {
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, w, h);

      const step = 70 * cam.z;
      const origin = worldToScreen(0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, state.worldRadius * cam.z, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = "#0b1220";
      ctx.fill();

      ctx.strokeStyle = "rgba(90, 140, 170, 0.07)";
      ctx.lineWidth = 1;
      const minX = cam.x - w / cam.z;
      const maxX = cam.x + w / cam.z;
      const minY = cam.y - h / cam.z;
      const maxY = cam.y + h / cam.z;
      const gx0 = Math.floor(minX / 70) * 70;
      const gy0 = Math.floor(minY / 70) * 70;
      ctx.beginPath();
      for (let x = gx0; x < maxX; x += 70) {
        const a = worldToScreen(x, minY);
        const b = worldToScreen(x, maxY);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      for (let y = gy0; y < maxY; y += 70) {
        const a = worldToScreen(minX, y);
        const b = worldToScreen(maxX, y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();

      ctx.restore();

      ctx.beginPath();
      ctx.arc(origin.x, origin.y, state.worldRadius * cam.z, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(184, 255, 60, 0.28)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, state.worldRadius * cam.z + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 77, 109, 0.16)";
      ctx.lineWidth = 10;
      ctx.stroke();
    }

    function drawFood(state) {
      for (const f of state.food) {
        const p = worldToScreen(f.x, f.y);
        if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
        const r = (3.2 + f.value * 0.9) * cam.z;
        ctx.beginPath();
        ctx.fillStyle = "hsl(" + f.hue + " 90% 60%)";
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (f.value >= 6) {
          ctx.beginPath();
          ctx.strokeStyle = "hsla(" + f.hue + " 90% 80% / 0.7)";
          ctx.lineWidth = 2;
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    function drawSnake(s, highlight) {
      if (!s.alive || !s.parts || s.parts.length < 2) return;
      const skin = Eng.SKINS[s.color % Eng.SKINS.length];
      const r = Eng.radiusOf(s) * cam.z;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < s.parts.length; i++) {
        const p = worldToScreen(s.parts[i].x, s.parts[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = skin.edge;
      ctx.lineWidth = r * 2 + 3;
      ctx.stroke();
      ctx.strokeStyle = skin.body;
      ctx.lineWidth = r * 2;
      ctx.stroke();

      if (s.boost) {
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = r * 0.45;
        ctx.stroke();
      }

      const head = worldToScreen(s.x, s.y);
      ctx.beginPath();
      ctx.fillStyle = skin.body;
      ctx.arc(head.x, head.y, r * 1.05, 0, Math.PI * 2);
      ctx.fill();
      if (highlight) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 2;
        ctx.arc(head.x, head.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      const ex = Math.cos(s.dir);
      const ey = Math.sin(s.dir);
      const px = -ey;
      const py = ex;
      const eyeR = Math.max(2.2, r * 0.28);
      for (const side of [-1, 1]) {
        const ox = head.x + ex * r * 0.35 + px * side * r * 0.42;
        const oy = head.y + ey * r * 0.35 + py * side * r * 0.42;
        ctx.beginPath();
        ctx.fillStyle = "#fff";
        ctx.arc(ox, oy, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#111";
        ctx.arc(ox + ex * eyeR * 0.35, oy + ey * eyeR * 0.35, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = "600 " + Math.max(11, 12 * cam.z) + "px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillText(s.name, head.x, head.y - r - 8);
    }

    function drawMinimap(state, followIds) {
      const size = Math.min(128, Math.floor(w * 0.28));
      const x = w - size - 12;
      const y = 12;
      ctx.fillStyle = "rgba(7,11,20,0.72)";
      ctx.strokeStyle = "rgba(184,255,60,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const k = (size / 2 - 4) / state.worldRadius;
      const cx = x + size / 2;
      const cy = y + size / 2;
      for (const s of state.snakes) {
        if (!s.alive) continue;
        const skin = Eng.SKINS[s.color % Eng.SKINS.length];
        ctx.fillStyle = followIds.has(s.id) ? "#fff" : skin.body;
        ctx.beginPath();
        ctx.arc(cx + s.x * k, cy + s.y * k, followIds.has(s.id) ? 3.4 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function draw() {
      return { w, h, cam };
    }

    function frame(state, followIds, dt) {
      const targets = state.snakes.filter((s) => followIds.has(s.id) && (s.alive || s.respawnIn > 0));
      const aliveTargets = targets.filter((s) => s.alive);
      follow(aliveTargets.length ? aliveTargets : targets.length ? targets : state.snakes.filter((s) => s.alive).slice(0, 1));
      cam.x = Eng.lerp(cam.x, cam.tx, 1 - Math.pow(0.001, dt));
      cam.y = Eng.lerp(cam.y, cam.ty, 1 - Math.pow(0.001, dt));
      cam.z = Eng.lerp(cam.z, cam.tz, 1 - Math.pow(0.01, dt));
      if (shake > 0) {
        cam.x += (Math.random() - 0.5) * shake * 8;
        cam.y += (Math.random() - 0.5) * shake * 8;
        shake = Math.max(0, shake - dt * 4);
      }

      drawBackground(state);
      drawFood(state);
      const ordered = state.snakes.slice().sort((a, b) => a.length - b.length);
      for (const s of ordered) drawSnake(s, followIds.has(s.id));
      drawMinimap(state, followIds);
    }

    function bump() {
      shake = 1;
    }

    return { resize, frame, bump, cam, draw };
  }

  root.CobraRender = { createRenderer };
})(typeof globalThis !== "undefined" ? globalThis : this);
