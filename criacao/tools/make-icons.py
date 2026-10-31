#!/usr/bin/env python3
"""Gera os ícones do Snake Livre sem dependência de biblioteca de imagem."""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "android" / "app" / "src" / "main" / "res"
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def blend(dst, src):
    sr, sg, sb, sa = src
    if sa <= 0:
        return dst
    dr, dg, db, da = dst
    sa /= 255
    da /= 255
    out_a = sa + da * (1 - sa)
    if out_a <= 0:
        return (0, 0, 0, 0)
    out_r = (sr * sa + dr * da * (1 - sa)) / out_a
    out_g = (sg * sa + dg * da * (1 - sa)) / out_a
    out_b = (sb * sa + db * da * (1 - sa)) / out_a
    return (int(out_r), int(out_g), int(out_b), int(out_a * 255))


def stamp(buf, w, h, cx, cy, radius, color):
    x0 = max(0, int(cx - radius - 2))
    x1 = min(w - 1, int(cx + radius + 2))
    y0 = max(0, int(cy - radius - 2))
    y1 = min(h - 1, int(cy + radius + 2))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            edge = radius - d
            if edge >= 1:
                alpha = 255
            elif edge > 0:
                alpha = int(255 * edge)
            else:
                continue
            src = (color[0], color[1], color[2], color[3] * alpha // 255)
            i = y * w + x
            buf[i] = blend(buf[i], src)


def render(size):
    buf = [(7, 17, 31, 255)] * (size * size)
    # fundo circular um pouco mais claro, para o recorte do launcher
    stamp(buf, size, size, size / 2, size / 2, size * 0.48, (12, 32, 58, 255))
    pts = []
    for i in range(18):
        t = i / 17
        ang = -2.2 + t * 3.3
        rad = size * (0.06 + t * 0.22)
        pts.append((size * 0.50 + math.cos(ang) * rad, size * 0.56 + math.sin(ang) * rad * 0.72))
    body = max(2.2, size * 0.055)
    for x, y in pts:
        stamp(buf, size, size, x, y, body, (61, 255, 154, 255))
    hx, hy = pts[-1]
    stamp(buf, size, size, hx, hy, body * 1.15, (180, 255, 220, 255))
    stamp(buf, size, size, hx + body * 0.35, hy - body * 0.15, body * 0.28, (16, 32, 48, 255))
    fx, fy = pts[3]
    stamp(buf, size, size, fx - size * 0.12, fy - size * 0.08, max(1.6, size * 0.03), (255, 214, 10, 255))
    return buf


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r, g, b, a = pixels[y * size + x]
            raw.extend((r, g, b, a))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def main():
    for folder, size in SIZES.items():
        pixels = render(size)
        directory = ROOT / folder
        write_png(directory / "ic_launcher.png", size, pixels)
        write_png(directory / "ic_launcher_round.png", size, pixels)
        print(folder, size)


if __name__ == "__main__":
    main()
