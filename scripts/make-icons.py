#!/usr/bin/env python3
"""Gera PNGs de ícone sem dependências externas."""
import struct
import zlib
from pathlib import Path


def png(w, h, rgba_fn):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(rgba_fn(x, y, w, h))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def pixel(x, y, w, h):
    nx = (x + 0.5) / w
    ny = (y + 0.5) / h
    # fundo
    r, g, b = 7, 11, 20
    # orbes
    for cx, cy, rad, col in (
        (0.22, 0.28, 0.06, (255, 77, 109)),
        (0.34, 0.20, 0.045, (184, 255, 60)),
        (0.72, 0.24, 0.07, (62, 224, 255)),
    ):
        d = ((nx - cx) ** 2 + (ny - cy) ** 2) ** 0.5
        if d < rad:
            t = 1 - d / rad
            r = int(r * (1 - t) + col[0] * t)
            g = int(g * (1 - t) + col[1] * t)
            b = int(b * (1 - t) + col[2] * t)
    # corpo da cobra (curva)
    pts = [(0.18, 0.72), (0.32, 0.48), (0.50, 0.42), (0.66, 0.55), (0.80, 0.58)]
    best = 9
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        vx, vy = x1 - x0, y1 - y0
        den = vx * vx + vy * vy or 1
        t = max(0, min(1, ((nx - x0) * vx + (ny - y0) * vy) / den))
        px, py = x0 + vx * t, y0 + vy * t
        best = min(best, ((nx - px) ** 2 + (ny - py) ** 2) ** 0.5)
    if best < 0.085:
        t = 1 - best / 0.085
        r = int(r * (1 - t) + 62 * t)
        g = int(g * (1 - t) + 224 * t)
        b = int(b * (1 - t) + 255 * t)
    # cabeça
    hx, hy = 0.84, 0.56
    d = ((nx - hx) ** 2 + (ny - hy) ** 2) ** 0.5
    if d < 0.09:
        t = 1 - d / 0.09
        r = int(r * (1 - t) + 184 * t)
        g = int(g * (1 - t) + 255 * t)
        b = int(b * (1 - t) + 60 * t)
    if ((nx - 0.87) ** 2 + (ny - 0.53) ** 2) ** 0.5 < 0.02:
        r, g, b = 17, 17, 17
    return bytes((r, g, b, 255))


root = Path("/workspace/android/app/src/main/res")
sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for folder, size in sizes.items():
    dest = root / folder
    dest.mkdir(parents=True, exist_ok=True)
    data = png(size, size, pixel)
    (dest / "ic_launcher.png").write_bytes(data)
    (dest / "ic_launcher_round.png").write_bytes(data)
print("icons ok")
