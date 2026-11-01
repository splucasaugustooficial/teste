/* Aurora TV OS — ilustrações geradas em SVG.
 * Cada arte é montada em camadas (<g class="L" style="--d:N">). Quando o cartão recebe o foco,
 * as camadas se deslocam em profundidades diferentes (efeito parallax das imagens em camadas). */
window.Art = (() => {
  "use strict";
  let uidN = 0;
  const uid = (p) => `${p}${++uidN}`;
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const L = (d, inner) => `<g class="L" style="--d:${d}">${inner}</g>`;
  const f1 = (n) => Math.round(n * 10) / 10;

  // ---- cores
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const shade = (c, t) => (t < 0 ? mix(c, "#000000", -t) : mix(c, "#ffffff", t));
  const palette = (bg) => { const m = String(bg).match(/#[0-9a-f]{6}/gi) || ["#5b8cff", "#1c1c1e"]; return { a: m[0], b: m[1] || shade(m[0], -0.5) }; };

  const lin = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join("")}</linearGradient>`;
  const rad = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join("")}</radialGradient>`;
  const bgRect = (w, h, fill) => `<rect x="-60" y="-60" width="${w + 120}" height="${h + 120}" fill="${fill}"/>`;
  const wave = (w, y0, amp, freq, ph, fill, h) => {
    let d = `M-60 ${y0}`;
    for (let x = -60; x <= w + 60; x += 12) d += ` L${x} ${f1(y0 + Math.sin(x * freq + ph) * amp)}`;
    return `<path d="${d} L${w + 60} ${h + 60} L-60 ${h + 60}Z" fill="${fill}"/>`;
  };
  const ridge = (w, h, base, height, jag, r, fill) => {
    let d = `M-60 ${h + 60} L-60 ${base}`;
    for (let x = -60; x <= w + 60; x += jag * (0.6 + r())) d += ` L${f1(x)} ${f1(base - r() * height)}`;
    return `<path d="${d} L${w + 60} ${base} L${w + 60} ${h + 60}Z" fill="${fill}"/>`;
  };

  // ---- cenas (w, h, r = aleatório com semente, p = paleta, s = escala)
  const SCENES = {
    space(w, h, r, p, s) {
      const sky = uid("g"), pl = uid("g");
      let stars = "";
      for (let i = 0; i < 90; i++) stars += `<circle cx="${f1(r() * w)}" cy="${f1(r() * h)}" r="${f1((0.3 + r() * 1.3) * s)}" fill="#fff" opacity="${f1(0.3 + r() * 0.7)}"/>`;
      const R = Math.min(w, h) * 0.24, cx = w * 0.68, cy = h * 0.36;
      return `<defs>${lin(sky, [[0, "#04020d"], [1, shade(p.b, -0.35)]])}${rad(pl, [[0, shade(p.a, 0.35)], [0.7, p.a], [1, shade(p.a, -0.5)]])}</defs>`
        + L(1, bgRect(w, h, `url(#${sky})`) + stars)
        + L(4, `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${pl})"/><ellipse cx="${cx}" cy="${cy}" rx="${R * 1.75}" ry="${R * 0.34}" fill="none" stroke="${shade(p.a, 0.5)}" stroke-width="${R * 0.07}" opacity=".8" transform="rotate(-16 ${cx} ${cy})"/>`)
        + L(9, (() => { const gr = Math.max(w, h) * 0.6, gy = h + gr * 0.78, top = gy - gr; return `<circle cx="${w * 0.3}" cy="${gy}" r="${gr}" fill="#151027"/><ellipse cx="${w * 0.22}" cy="${top + (h - top) * 0.55}" rx="${14 * s}" ry="${4 * s}" fill="#0c0919"/><ellipse cx="${w * 0.42}" cy="${top + (h - top) * 0.8}" rx="${20 * s}" ry="${5 * s}" fill="#0c0919"/>`; })());
    },
    city(w, h, r, p, s) {
      const sky = uid("g");
      let back = "", front = "", win = "", stars = "";
      for (let i = 0; i < 30; i++) stars += `<circle cx="${f1(r() * w)}" cy="${f1(r() * h * 0.5)}" r="${f1(0.8 * s)}" fill="#fff" opacity="${f1(r() * 0.8)}"/>`;
      for (let x = -60; x < w + 60;) { const bw = (16 + r() * 26) * s, bh = h * (0.3 + r() * 0.32); back += `<rect x="${f1(x)}" y="${f1(h - bh)}" width="${f1(bw)}" height="${f1(bh + 60)}" fill="${shade(p.b, -0.45)}"/>`; x += bw + 2 * s; }
      for (let x = -60; x < w + 60;) {
        const bw = (22 + r() * 34) * s, bh = h * (0.14 + r() * 0.3), y = h - bh;
        front += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${f1(bh + 60)}" fill="#08061a"/>`;
        for (let wy = y + 6 * s; wy < h - 4 * s; wy += 7 * s) for (let wx = x + 4 * s; wx < x + bw - 6 * s; wx += 7 * s)
          if (r() < 0.35) win += `<rect x="${f1(wx)}" y="${f1(wy)}" width="${f1(3 * s)}" height="${f1(3.5 * s)}" fill="${r() < 0.8 ? "#ffd479" : p.a}" opacity="${f1(0.6 + r() * 0.4)}"/>`;
        x += bw + 3 * s;
      }
      return `<defs>${lin(sky, [[0, "#070718"], [0.65, shade(p.a, -0.25)], [1, p.a]])}</defs>`
        + L(1, bgRect(w, h, `url(#${sky})`) + stars)
        + L(3, `<circle cx="${w * 0.76}" cy="${h * 0.22}" r="${20 * s}" fill="#fff4d6"/><circle cx="${w * 0.76}" cy="${h * 0.22}" r="${42 * s}" fill="#fff4d6" opacity=".12"/>`)
        + L(5, back) + L(9, front + win);
    },
    ocean(w, h, r, p, s) {
      const sky = uid("g");
      return `<defs>${lin(sky, [[0, shade(p.b, 0.15)], [0.55, shade(p.a, 0.55)], [1, "#ffe8c2"]])}</defs>`
        + L(1, bgRect(w, h, `url(#${sky})`))
        + L(3, `<circle cx="${w * 0.7}" cy="${h * 0.42}" r="${30 * s}" fill="#fff6d8"/><circle cx="${w * 0.7}" cy="${h * 0.42}" r="${60 * s}" fill="#fff6d8" opacity=".25"/>`)
        + L(5, wave(w, h * 0.56, 4 * s, 0.03 / s, r() * 6, shade(p.a, 0.1), h))
        + L(8, wave(w, h * 0.68, 7 * s, 0.022 / s, r() * 6, shade(p.a, -0.2), h))
        + L(12, wave(w, h * 0.82, 10 * s, 0.016 / s, r() * 6, shade(p.b, -0.35), h) + wave(w, h * 0.84, 3 * s, 0.05 / s, r() * 6, "#ffffff", h).replace('fill="#ffffff"', 'fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="' + 1.5 * s + '"'));
    },
    forest(w, h, r, p, s) {
      const sky = uid("g");
      let pines = "";
      for (let x = -40; x < w + 40; x += (10 + r() * 16) * s) {
        const ph = (40 + r() * 70) * s, pw = ph * 0.42, base = h + 4;
        pines += `<polygon points="${f1(x)},${f1(base - ph)} ${f1(x + pw / 2)},${base} ${f1(x - pw / 2)},${base}" fill="${shade(p.a, -0.72)}"/>`;
      }
      return `<defs>${lin(sky, [[0, shade(p.b, 0.45)], [1, shade(p.a, 0.3)]])}</defs>`
        + L(1, bgRect(w, h, `url(#${sky})`) + `<circle cx="${w * 0.28}" cy="${h * 0.3}" r="${22 * s}" fill="#fffbe6" opacity=".9"/>`)
        + L(3, ridge(w, h, h * 0.6, h * 0.3, 40 * s, r, shade(p.a, -0.15)))
        + L(6, ridge(w, h, h * 0.75, h * 0.22, 26 * s, r, shade(p.a, -0.45)))
        + L(11, pines);
    },
    sunset(w, h, r, p, s) {
      const sky = uid("g"), clip = uid("c");
      const cx = w * 0.5, cy = h * 0.55, R = Math.min(w, h) * 0.27;
      let bands = "";
      for (let i = 0; i < 7; i++) { const y = cy - R + i * (R / 3.4); bands += `<rect x="${cx - R}" y="${f1(y)}" width="${R * 2}" height="${f1(R / 3.4 - i * 1.4 * s)}"/>`; }
      const road = `<polygon points="${cx - 3 * s},${h * 0.66} ${cx + 3 * s},${h * 0.66} ${w * 0.95},${h + 60} ${w * 0.05},${h + 60}" fill="#1a0f26"/>`;
      let dashes = "";
      for (let i = 0; i < 5; i++) { const t0 = i / 5, t1 = t0 + 0.08, y0 = h * 0.66 + (h * 0.4) * t0 * t0, y1 = h * 0.66 + (h * 0.4) * t1 * t1; dashes += `<polygon points="${cx - (0.5 + t0 * 4) * s},${f1(y0)} ${cx + (0.5 + t0 * 4) * s},${f1(y0)} ${cx + (0.5 + t1 * 4) * s},${f1(y1)} ${cx - (0.5 + t1 * 4) * s},${f1(y1)}" fill="#ffd166"/>`; }
      return `<defs>${lin(sky, [[0, shade(p.b, -0.2)], [0.55, p.a], [1, shade(p.a, 0.45)]])}<clipPath id="${clip}">${bands}</clipPath></defs>`
        + L(1, bgRect(w, h, `url(#${sky})`))
        + L(3, `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#ffe27a" clip-path="url(#${clip})"/>`)
        + L(6, ridge(w, h, h * 0.68, h * 0.14, 30 * s, r, shade(p.b, -0.55)))
        + L(11, road + dashes);
    },
    stage(w, h, r, p, s) {
      const bg = uid("g"), beam = uid("g");
      let beams = "", bokeh = "";
      for (let i = 0; i < 4; i++) { const x = w * (0.15 + i * 0.23), spread = w * 0.16; beams += `<polygon points="${f1(x - 4 * s)},-10 ${f1(x + 4 * s)},-10 ${f1(x + spread)},${h * 0.85} ${f1(x - spread)},${h * 0.85}" fill="url(#${beam})" opacity="${f1(0.35 + r() * 0.3)}"/>`; }
      for (let i = 0; i < 18; i++) bokeh += `<circle cx="${f1(r() * w)}" cy="${f1(h * 0.55 + r() * h * 0.4)}" r="${f1((4 + r() * 12) * s)}" fill="${r() < 0.5 ? p.a : "#ffd479"}" opacity="${f1(0.15 + r() * 0.35)}"/>`;
      return `<defs>${rad(bg, [[0, shade(p.b, -0.2)], [1, "#06040c"]])}${lin(beam, [[0, "#fff", 0.95], [1, p.a, 0]])}</defs>`
        + L(1, bgRect(w, h, `url(#${bg})`)) + L(3, beams)
        + L(6, `<ellipse cx="${w / 2}" cy="${h * 0.95}" rx="${w * 0.6}" ry="${h * 0.12}" fill="${shade(p.a, -0.6)}"/>`) + L(10, bokeh);
    },
    glitch(w, h, r, p, s) {
      let rings = "", bars = "", lines = "";
      for (let i = 1; i < 7; i++) rings += `<circle cx="${w * 0.62}" cy="${h * 0.42}" r="${i * 16 * s}" fill="none" stroke="${p.b}" stroke-opacity="${f1(0.7 - i * 0.09)}" stroke-width="${1.4 * s}"/>`;
      for (let y = 0; y < h; y += 4 * s) lines += `<rect x="-60" y="${f1(y)}" width="${w + 120}" height="${f1(1.2 * s)}" fill="#fff" opacity=".03"/>`;
      for (let i = 0; i < 9; i++) bars += `<rect x="${f1(r() * w - 20)}" y="${f1(r() * h)}" width="${f1((20 + r() * 90) * s)}" height="${f1((2 + r() * 6) * s)}" fill="${r() < 0.5 ? p.b : "#ff2d55"}" opacity="${f1(0.4 + r() * 0.5)}"/>`;
      return L(1, bgRect(w, h, "#05060c") + lines)
        + L(4, rings + `<circle cx="${w * 0.62}" cy="${h * 0.42}" r="${9 * s}" fill="${p.b}"/>`)
        + L(9, bars);
    },
    warm(w, h, r, p, s) {
      const bg = uid("g");
      let plates = "", steam = "", dots = "";
      const pos = [[0.3, 0.55, 46], [0.72, 0.42, 38], [0.58, 0.85, 30]];
      pos.forEach(([x, y, R]) => { plates += `<circle cx="${w * x}" cy="${h * y}" r="${R * s}" fill="#fff8ef"/><circle cx="${w * x}" cy="${h * y}" r="${R * 0.72 * s}" fill="${shade(p.a, -0.05)}"/><circle cx="${w * x - R * 0.2 * s}" cy="${h * y - R * 0.2 * s}" r="${R * 0.25 * s}" fill="${shade(p.a, 0.35)}"/>`; });
      for (let i = 0; i < 3; i++) { const x = w * (0.24 + i * 0.06); steam += `<path d="M${x} ${h * 0.38} c${-8 * s} ${-10 * s} ${8 * s} ${-18 * s} 0 ${-30 * s} c${-8 * s} ${-10 * s} ${6 * s} ${-16 * s} 0 ${-26 * s}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="${2.2 * s}" stroke-linecap="round"/>`; }
      for (let i = 0; i < 26; i++) dots += `<circle cx="${f1(r() * w)}" cy="${f1(r() * h)}" r="${f1((1 + r() * 2) * s)}" fill="${shade(p.b, -0.3)}" opacity=".5"/>`;
      return `<defs>${lin(bg, [[0, shade(p.a, 0.25)], [1, shade(p.b, -0.1)]], 1, 1)}</defs>`
        + L(1, bgRect(w, h, `url(#${bg})`) + dots) + L(5, plates) + L(10, steam);
    },
    kids(w, h, r, p, s) {
      const bg = uid("g");
      let stars = "", planets = "", clouds = "";
      for (let i = 0; i < 16; i++) { const x = r() * w, y = r() * h * 0.7, R = (3 + r() * 4) * s; stars += `<path d="M${f1(x)} ${f1(y - R)} L${f1(x + R * 0.3)} ${f1(y - R * 0.3)} L${f1(x + R)} ${f1(y)} L${f1(x + R * 0.3)} ${f1(y + R * 0.3)} L${f1(x)} ${f1(y + R)} L${f1(x - R * 0.3)} ${f1(y + R * 0.3)} L${f1(x - R)} ${f1(y)} L${f1(x - R * 0.3)} ${f1(y - R * 0.3)}Z" fill="#fff" opacity=".85"/>`; }
      [["#ffd60a", 0.25, 0.3, 26], ["#ff6b9a", 0.72, 0.28, 18], ["#7cf0c8", 0.55, 0.58, 14]].forEach(([c, x, y, R]) => {
        planets += `<circle cx="${w * x}" cy="${h * y}" r="${R * s}" fill="${c}"/><circle cx="${w * x - R * 0.3 * s}" cy="${h * y - R * 0.3 * s}" r="${R * 0.3 * s}" fill="#fff" opacity=".35"/>`;
      });
      for (let i = 0; i < 4; i++) { const x = w * (i / 3), y = h * 0.92; clouds += `<g fill="#fff"><circle cx="${f1(x)}" cy="${y}" r="${24 * s}"/><circle cx="${f1(x + 24 * s)}" cy="${y - 10 * s}" r="${28 * s}"/><circle cx="${f1(x + 52 * s)}" cy="${y}" r="${22 * s}"/></g>`; }
      return `<defs>${lin(bg, [[0, shade(p.a, -0.1)], [1, shade(p.b, 0.2)]])}</defs>`
        + L(1, bgRect(w, h, `url(#${bg})`) + stars) + L(5, planets) + L(11, clouds);
    },
    garden(w, h, r, p, s) {
      const bg = uid("g");
      let flowers = "", grass = "";
      for (let i = 0; i < 5; i++) {
        const x = w * (0.1 + i * 0.2 + (r() - 0.5) * 0.08), y = h * (0.45 + r() * 0.2), R = (10 + r() * 8) * s;
        let petals = "";
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; petals += `<circle cx="${f1(x + Math.cos(a) * R)}" cy="${f1(y + Math.sin(a) * R)}" r="${f1(R * 0.62)}" fill="${i % 2 ? "#ffd60a" : "#ffffff"}"/>`; }
        flowers += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + (r() - 0.5) * 10 * s)}" y2="${h + 10}" stroke="#2b7a3d" stroke-width="${3 * s}"/>${petals}<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 0.55)}" fill="${shade(p.b, -0.2)}"/>`;
      }
      for (let x = -40; x < w + 40; x += 5 * s) grass += `<path d="M${f1(x)} ${h + 4} q${f1(2 * s)} ${f1(-12 * s - r() * 14 * s)} ${f1(5 * s + r() * 4 * s)} ${f1(-20 * s - r() * 14 * s)}" fill="none" stroke="${r() < 0.5 ? "#2f9e44" : "#40c057"}" stroke-width="${2 * s}"/>`;
      return `<defs>${lin(bg, [[0, "#9be7ff"], [1, shade(p.a, 0.5)]])}</defs>`
        + L(1, bgRect(w, h, `url(#${bg})`) + `<circle cx="${w * 0.8}" cy="${h * 0.2}" r="${24 * s}" fill="#fff3b0"/>`)
        + L(6, flowers) + L(11, grass);
    },
    tech(w, h, r, p, s) {
      const bg = uid("g");
      let grid = "", cards = "";
      const hy = h * 0.55;
      for (let i = -10; i <= 10; i++) grid += `<line x1="${w / 2 + i * 6 * s}" y1="${hy}" x2="${w / 2 + i * 60 * s}" y2="${h + 40}" stroke="${p.a}" stroke-opacity=".45" stroke-width="${s}"/>`;
      for (let i = 0; i < 7; i++) { const y = hy + Math.pow(i / 7, 2) * (h - hy + 40); grid += `<line x1="-60" y1="${f1(y)}" x2="${w + 60}" y2="${f1(y)}" stroke="${p.a}" stroke-opacity=".35" stroke-width="${s}"/>`; }
      for (let i = 0; i < 5; i++) { const cw = (24 + r() * 26) * s; cards += `<rect x="${f1(r() * (w - cw))}" y="${f1(h * 0.08 + r() * h * 0.38)}" width="${f1(cw)}" height="${f1(cw * 0.7)}" rx="${6 * s}" fill="${i % 2 ? p.a : "#ffffff"}" opacity="${f1(0.25 + r() * 0.5)}"/>`; }
      return `<defs>${lin(bg, [[0, shade(p.b, -0.4)], [1, shade(p.b, -0.1)]])}</defs>`
        + L(1, bgRect(w, h, `url(#${bg})`) + `<circle cx="${w / 2}" cy="${hy}" r="${40 * s}" fill="${p.a}" opacity=".35"/>`)
        + L(4, grid) + L(10, cards);
    },
    field(w, h, r, p, s) {
      let stripes = "";
      for (let i = 0; i < 12; i++) stripes += `<rect x="${f1(-60 + i * (w + 120) / 12)}" y="-60" width="${f1((w + 120) / 12 + 1)}" height="${h + 120}" fill="${i % 2 ? "#2f9e44" : "#37b24d"}"/>`;
      const st = `fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="${2.2 * s}"`;
      return L(1, stripes)
        + L(4, `<line x1="${w / 2}" y1="-20" x2="${w / 2}" y2="${h + 20}" ${st}/><circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.22}" ${st}/><rect x="-10" y="${h * 0.25}" width="${w * 0.16}" height="${h * 0.5}" ${st}/><rect x="${w * 0.84 + 10}" y="${h * 0.25}" width="${w * 0.2}" height="${h * 0.5}" ${st}/>`)
        + L(9, `<circle cx="${w * 0.62}" cy="${h * 0.6}" r="${7 * s}" fill="#fff"/><circle cx="${w * 0.62 + 2 * s}" cy="${h * 0.6 - 2 * s}" r="${2.4 * s}" fill="#222"/>`);
    },
  };

  // ---- título desenhado sobre a arte
  const FONTS = {
    sans: `font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Inter, sans-serif" font-weight="800" letter-spacing="-0.02em"`,
    serif: `font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-style="italic"`,
    mono: `font-family="'SF Mono', Menlo, Consolas, monospace" font-weight="700" letter-spacing="0.04em"`,
    round: `font-family="'Arial Rounded MT Bold', 'Nunito', -apple-system, sans-serif" font-weight="900"`,
  };
  function wrap(text, max) {
    const words = text.split(" "), lines = [];
    let cur = "";
    for (const wd of words) { if ((cur + " " + wd).trim().length > max && cur) { lines.push(cur); cur = wd; } else cur = (cur + " " + wd).trim(); }
    if (cur) lines.push(cur);
    return lines;
  }
  function titleLayer(text, w, h, font = "sans", upper = false) {
    const fade = uid("g");
    const poster = h > w;
    const fs = poster ? w * 0.13 : h * 0.15;
    const lines = wrap(upper ? text.toUpperCase() : text, Math.max(6, Math.floor((w * 0.84) / (fs * (font === "mono" ? 0.62 : 0.56)))));
    const x = w * 0.07, lh = fs * 1.02, y0 = h - h * (poster ? 0.07 : 0.11) - (lines.length - 1) * lh;
    const tspans = lines.map((ln, i) => `<tspan x="${f1(x)}" y="${f1(y0 + i * lh)}">${esc(ln)}</tspan>`).join("");
    return `<defs>${lin(fade, [[0, "#000", 0], [1, "#000", 0.7]])}</defs><rect x="-60" y="${h * 0.45}" width="${w + 120}" height="${h * 0.6}" fill="url(#${fade})"/>`
      + L(14, `<text ${FONTS[font] || FONTS.sans} font-size="${f1(fs)}" fill="#fff" style="paint-order:stroke" stroke="rgba(0,0,0,.25)" stroke-width="${f1(fs * 0.04)}">${tspans}</text>`);
  }

  const SIZES = { poster: [200, 300], land: [320, 180], hero: [1600, 900], square: [300, 300], photo: [320, 200] };
  const svg = (w, h, body, cls = "") => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  function scene(name, seedKey, colors, kind, title) {
    const [w, h] = SIZES[kind] || SIZES.land;
    const s = Math.min(w, h) / (kind === "hero" ? 210 : 180);
    const r = rng(hash(seedKey));
    const body = (SCENES[name] || SCENES.sunset)(w, h, r, colors, s);
    return svg(w, h, body + (title ? titleLayer(title.text, w, h, title.font, title.upper) : ""));
  }

  // ---- API pública
  const movie = (m, kind = "poster") => scene(m.scene, m.id, palette(m.bg), kind, kind === "hero" ? null : { text: m.title, font: m.font, upper: m.upper });
  const photo = (p, kind = "photo") => scene(p.scene, p.name, palette(p.bg), kind, null);
  function channel(c, kind = "land") {
    const col = { a: `#${hsl(c.hue, 70, 50)}`, b: `#${hsl(c.hue + 30, 60, 25)}` };
    if (kind === "hero") return scene(c.scene, "ch" + c.n, col, "hero", null);
    const [w, h] = SIZES.land;
    const s = h / 180;
    const body = SCENES[c.scene](w, h, rng(hash("ch" + c.n)), col, s);
    const scrim = uid("g");
    return svg(w, h, body + `<defs>${lin(scrim, [[0, "#000", 0.15], [1, "#000", 0.55]])}</defs><rect x="-60" y="-60" width="${w + 120}" height="${h + 120}" fill="url(#${scrim})"/>`
      + L(14, `<text x="${w / 2}" y="${h / 2 + 12}" text-anchor="middle" ${FONTS.sans} font-size="34" fill="#fff">${esc(c.name)}</text><rect x="16" y="14" rx="6" width="40" height="24" fill="rgba(255,255,255,.9)"/><text x="36" y="31" text-anchor="middle" ${FONTS.sans} font-size="15" fill="#000">${c.n}</text>`));
  }
  function hsl(hh, ss, ll) {
    ss /= 100; ll /= 100;
    const k = (n) => (n + hh / 30) % 12, a = ss * Math.min(ll, 1 - ll);
    const f = (n) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  }
  function album(t, kind = "square", withCaption = true) {
    const [w, h] = SIZES[kind === "hero" ? "hero" : "square"];
    const r = rng(hash(t.name)), p = palette(t.bg);
    const g1 = uid("g"), blur = uid("b");
    let art = "";
    const style = t.seed % 3;
    if (style === 0) for (let i = 9; i > 0; i--) art += `<circle cx="${w * 0.5}" cy="${h * 0.42}" r="${i * Math.min(w, h) * 0.07}" fill="${mix(p.a, p.b, i / 9)}"/>`;
    else if (style === 1) for (let i = -6; i < 14; i++) art += `<rect x="${i * w * 0.1}" y="-${h}" width="${w * 0.05}" height="${h * 3}" fill="${i % 2 ? p.a : shade(p.b, 0.2)}" transform="rotate(30 ${w / 2} ${h / 2})"/>`;
    else for (let i = 0; i < 6; i++) art += `<circle cx="${f1(r() * w)}" cy="${f1(r() * h)}" r="${f1(Math.min(w, h) * (0.18 + r() * 0.22))}" fill="${[p.a, p.b, "#ffffff", shade(p.a, 0.4)][i % 4]}" opacity=".85" filter="url(#${blur})"/>`;
    const caption = kind === "hero" || !withCaption ? "" : L(12, `<text x="22" y="${h - 46}" ${FONTS.sans} font-size="26" fill="#fff">${esc(t.name)}</text><text x="22" y="${h - 20}" font-family="-apple-system, sans-serif" font-size="16" fill="#fff" opacity=".8">${esc(t.artist)}</text>`);
    return svg(w, h, `<defs>${lin(g1, [[0, shade(p.b, -0.3)], [1, p.a]], 1, 1)}<filter id="${blur}"><feGaussianBlur stdDeviation="${Math.min(w, h) * 0.06}"/></filter></defs>`
      + L(1, bgRect(w, h, `url(#${g1})`)) + L(6, art)
      + (kind === "hero" || !withCaption ? "" : `<rect x="0" y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="#000" opacity=".25"/>`) + caption);
  }

  // ---- ícones dos apps (16:9.6), em duas camadas
  const gearPath = (cx, cy, R, r, teeth, hole) => {
    let d = "";
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : R;
      d += `${i ? "L" : "M"}${f1(cx + Math.cos(a0 + 0.06) * rr)} ${f1(cy + Math.sin(a0 + 0.06) * rr)} L${f1(cx + Math.cos(a1 - 0.06) * rr)} ${f1(cy + Math.sin(a1 - 0.06) * rr)} `;
    }
    return d + `Z M${cx + hole} ${cy} A${hole} ${hole} 0 1 0 ${cx - hole} ${cy} A${hole} ${hole} 0 1 0 ${cx + hole} ${cy}Z`;
  };
  const ICONS = {
    movies: `<rect x="31" y="15" width="38" height="26" rx="5" fill="none" stroke="#fff" stroke-width="3"/><polygon points="46,22 46,34 56,28" fill="#fff"/><line x1="42" y1="46" x2="58" y2="46" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    live: `<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M42 21a12 12 0 0 0 0 18"/><path d="M58 21a12 12 0 0 1 0 18"/><path d="M36 15a20 20 0 0 0 0 30"/><path d="M64 15a20 20 0 0 1 0 30"/></g><circle cx="50" cy="30" r="4.5" fill="#fff"/>`,
    music: `<path d="M45 41V19l16-4v22" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="40.5" cy="41" rx="5.5" ry="4.5" fill="#fff"/><ellipse cx="56.5" cy="37" rx="5.5" ry="4.5" fill="#fff"/>`,
    photos: `<rect x="31" y="14" width="38" height="30" rx="5" fill="#fff" stroke="#d1d1d6" stroke-width="1.5"/><circle cx="60" cy="23" r="3.6" fill="#ff9f0a"/><polygon points="34,41 45,27 53,36 58,31 66,41" fill="#30d158"/><polygon points="45,41 53,33 61,41" fill="#0a84ff" opacity=".8"/>`,
    weather: `<circle cx="44" cy="25" r="8" fill="#ffd60a"/><g stroke="#ffd60a" stroke-width="2.4" stroke-linecap="round"><line x1="44" y1="11" x2="44" y2="13.5"/><line x1="31" y1="25" x2="33.5" y2="25"/><line x1="34.8" y1="15.8" x2="36.6" y2="17.6"/><line x1="53.2" y1="15.8" x2="51.4" y2="17.6"/></g><g fill="#fff"><circle cx="51" cy="35" r="7"/><circle cx="59" cy="31" r="8.5"/><circle cx="67" cy="36" r="6"/><rect x="51" y="35" width="16" height="7" rx="3"/></g>`,
    search: `<circle cx="47" cy="27" r="9.5" fill="none" stroke="#fff" stroke-width="4"/><line x1="54" y1="34" x2="62" y2="42" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
    settings: `<path d="${gearPath(50, 30, 15, 11.5, 10, 5)}" fill="#fff" fill-rule="evenodd"/>`,
  };
  function icon(id) {
    const hi = uid("g");
    return svg(100, 60, `<defs>${rad(hi, [[0, "#fff", 0.35], [1, "#fff", 0]])}</defs>`
      + L(2, `<ellipse cx="38" cy="4" rx="60" ry="30" fill="url(#${hi})"/>`)
      + L(7, `<g filter="drop-shadow(0 1.5px 2px rgba(0,0,0,.25))">${ICONS[id] || ""}</g>`), "icon-svg");
  }

  // ---- símbolos da interface (24×24, herdam a cor do texto)
  const SYM = {
    play: `<polygon points="7,4.5 19.5,12 7,19.5" fill="currentColor"/>`,
    pause: `<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>`,
    prev: `<polygon points="11,6 3,12 11,18" fill="currentColor"/><polygon points="20,6 12,12 20,18" fill="currentColor"/>`,
    next: `<polygon points="4,6 12,12 4,18" fill="currentColor"/><polygon points="13,6 21,12 13,18" fill="currentColor"/>`,
    plus: `<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    power: `<path d="M12 3v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.6 6.8a8 8 0 1 0 10.8 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
    moon: `<path d="M20 14.6A8.5 8.5 0 1 1 9.4 4a6.8 6.8 0 0 0 10.6 10.6z" fill="currentColor"/>`,
    sun: `<circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>`,
    search: `<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
    person: `<circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7.2 8-7.2s8 2.8 8 7.2z" fill="currentColor"/>`,
    gear: `<path d="${gearPath(12, 12, 9.5, 7.2, 8, 3)}" fill="currentColor" fill-rule="evenodd"/>`,
    theme: `<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>`,
    accent: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="9.5" r="1.8" fill="currentColor"/><circle cx="13" cy="7.5" r="1.8" fill="currentColor"/><circle cx="16.3" cy="11" r="1.8" fill="currentColor"/><circle cx="10" cy="15" r="2.2" fill="currentColor"/>`,
    text: `<text x="12" y="17" text-anchor="middle" font-family="-apple-system, sans-serif" font-weight="700" font-size="13" fill="currentColor">Aa</text>`,
    dunes: `<circle cx="16.5" cy="7.5" r="2.6" fill="currentColor"/><path d="M2 19c3.5-6 7.5-6.5 10.5-3s6 3 9.5-1.5V21H2z" fill="currentColor"/>`,
    sound: `<polygon points="3.5,9 7.5,9 12.5,5 12.5,19 7.5,15 3.5,15" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    tv: `<rect x="2.5" y="4.5" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    reset: `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polyline points="4,3.5 4,8 8.5,8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    info: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.4" fill="currentColor"/>`,
    captions: `<rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 14h5M13 14h5M6 10.5h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    wave: `<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
    rew: `<path d="M4 12a8 8 0 1 0 2.4-5.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="3.5,3.5 3.5,8 8,8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="12.5" y="15.4" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="7.5" font-weight="700" fill="currentColor">10</text>`,
    fwd: `<path d="M20 12a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="20.5,3.5 20.5,8 16,8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="11.5" y="15.4" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="7.5" font-weight="700" fill="currentColor">10</text>`,
  };
  const sym = (name) => `<svg class="sym" viewBox="0 0 24 24" aria-hidden="true">${SYM[name] || ""}</svg>`;

  // ---- ícones de clima
  const WX = {
    sun: SYM.sun.replace(/currentColor/g, "#ffd60a"),
    partly: `<circle cx="10" cy="9" r="4" fill="#ffd60a"/><g fill="#fff"><circle cx="11" cy="15" r="3.6"/><circle cx="15" cy="13" r="4.3"/><circle cx="19" cy="15.6" r="2.8"/><rect x="11" y="15" width="8" height="3.6" rx="1.8"/></g>`,
    cloud: `<g fill="#fff"><circle cx="8" cy="14" r="4"/><circle cx="13" cy="11" r="5.2"/><circle cx="18" cy="14.5" r="3.4"/><rect x="8" y="14" width="10" height="4" rx="2"/></g>`,
    rain: `<g fill="#fff"><circle cx="8" cy="10" r="4"/><circle cx="13" cy="7.5" r="5"/><circle cx="18" cy="10.5" r="3.4"/><rect x="8" y="10" width="10" height="4" rx="2"/></g><path d="M8 17l-1 3M12.5 17l-1 3M17 17l-1 3" stroke="#64d2ff" stroke-width="2" stroke-linecap="round"/>`,
    storm: `<g fill="#fff"><circle cx="8" cy="10" r="4"/><circle cx="13" cy="7.5" r="5"/><circle cx="18" cy="10.5" r="3.4"/><rect x="8" y="10" width="10" height="4" rx="2"/></g><polygon points="13,14 10,19 12.5,19 11,23 16,17 13.4,17 15,14" fill="#ffd60a"/>`,
  };
  const wx = (k) => `<svg class="wx" viewBox="0 0 24 24" aria-hidden="true">${WX[k] || WX.sun}</svg>`;

  return { movie, photo, channel, album, icon, sym, wx, palette };
})();
