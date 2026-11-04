"""Rasterize the existing Bruhs circle-and-ellipse logo for platform app icons.

Run with: uv run --with pillow python scripts/render-icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4


def render(size: int, transparent: bool = False) -> Image.Image:
    canvas = Image.new('RGBA', (1024 * SCALE, 1024 * SCALE), (0, 0, 0, 0) if transparent else '#15110d')
    draw = ImageDraw.Draw(canvas)
    radius = 300
    offset = 212

    def ellipse(x: float, y: float, rx: float, ry: float, fill: str) -> None:
        draw.ellipse(tuple(round(c * SCALE) for c in (offset + x - rx, offset + y - ry, offset + x + rx, offset + y + ry)), fill=fill)

    ellipse(300, 300, radius, radius, '#fada5e')
    ellipse(198, 223, 40, 10, '#0a0a0a')
    ellipse(401, 223, 40, 10, '#0a0a0a')
    ellipse(307, 378, 120, 10, '#ec6055')
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


render(1024).convert('RGB').save(ROOT / 'assets/icon.png')
render(1024, True).save(ROOT / 'assets/adaptive-icon.png')
render(256, True).save(ROOT / 'assets/splash-icon.png')
render(64).save(ROOT / 'assets/favicon.png')
