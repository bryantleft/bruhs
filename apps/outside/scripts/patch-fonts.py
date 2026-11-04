"""Builds the bundled Pixelify Sans instances with legible digits.

Pixelify Sans draws 5, 2 and S almost alike at small sizes, and its fi/fl ligatures read as "A".
In a game built on step and coin counts that misleads players, so this script:
  1. instances the variable font at Regular (400) and Bold (700),
  2. redraws 0-9 and % as classic 5x7 pixel digits on Pixelify's own pixel grid,
  3. drops the liga and dlig features,
  4. renames the family "Pixelify Sans Outside" (a Modified Version under the OFL).

Silkscreen Bold fills both dots of its % solid, so "0%" reads as "0Z". The script redraws that one
glyph in the bundled assets/fonts/Silkscreen-Bold.ttf, in place (re-running gives the same file),
and renames it "Silkscreen Outside".

Usage: python3 scripts/patch-fonts.py path/to/PixelifySans[wght].ttf
Sources (SIL OFL 1.1, no reserved font names):
  https://github.com/google/fonts/tree/main/ofl/pixelifysans
  https://github.com/google/fonts/tree/main/ofl/silkscreen
"""

import sys
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"

DIGITS = {
    "zero": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "one": [".#.", "##.", ".#.", ".#.", ".#.", ".#.", "###"],
    "two": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "three": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "four": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "five": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "six": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "seven": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "eight": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "nine": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    "percent": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
}


def draw(rows, left, top, cell_w, cell_h, smear_x, smear_y):
    """One rectangle per horizontal run; bold weights smear each pixel right and down."""
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        c = 0
        while c < len(row):
            if row[c] != "#":
                c += 1
                continue
            start = c
            while c < len(row) and row[c] == "#":
                c += 1
            x0 = round(left + start * cell_w)
            x1 = round(left + c * cell_w + smear_x)
            y1 = round(top - r * cell_h)
            # Overlap the row below by one unit so stacked runs never show a seam.
            y0 = round(top - (r + 1) * cell_h - smear_y) - 1
            pen.moveTo((x0, y0))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y0))
            pen.closePath()
    return pen.glyph()


def patch(source: Path, weight: int, style: str) -> None:
    font = instancer.instantiateVariableFont(TTFont(source), {"wght": weight}, updateFontNames=True)
    glyf = font["glyf"]
    cmap = font.getBestCmap()
    five = glyf[cmap[ord("5")]]
    five.recalcBounds(glyf)
    left, bottom, right, top = five.xMin, five.yMin, five.xMax, five.yMax
    # Regular strokes are one cell; Bold is about 40% heavier, so smear each pixel.
    smear_x = 0 if weight < 600 else round((right - left) * 0.065)
    smear_y = 0 if weight < 600 else round((top - bottom) * 0.055)
    cell_w = (right - left - smear_x) / 5
    cell_h = (top - bottom - smear_y) / 7
    for name, rows in DIGITS.items():
        glyph_name = cmap[ord("%")] if name == "percent" else cmap[ord(str(list(DIGITS).index(name)))]
        glyph = draw(rows, left, top, cell_w, cell_h, smear_x, smear_y)
        glyph.flags[0] |= 0x40  # OVERLAP_SIMPLE: runs touch, renderers should union them.
        glyf[glyph_name] = glyph
        # Advances follow the drawing, so a narrow 1 doesn't leave a gap ("1 50").
        right_bearing = font["hmtx"][cmap[ord("0")]][0] - right
        width = len(rows[0]) * cell_w + smear_x
        font["hmtx"][glyph_name] = (round(left + width + right_bearing), left)
    # Ligatures off: keep the features but point them at no lookups.
    if "GSUB" in font:
        for record in font["GSUB"].table.FeatureList.FeatureRecord:
            if record.FeatureTag in ("liga", "dlig"):
                record.Feature.LookupListIndex = []
                record.Feature.LookupCount = 0
    # Variation leftovers point at the old digits; the static instance does not need them.
    for table in ("HVAR", "MVAR", "STAT"):
        if table in font:
            del font[table]
    names = font["name"]
    for record in names.names:
        if record.nameID in (1, 16):
            record.string = "Pixelify Sans Outside"
        elif record.nameID == 4:
            record.string = f"Pixelify Sans Outside {style}"
        elif record.nameID == 6:
            record.string = f"PixelifySansOutside-{style}"
    font.save(OUT / f"PixelifySans-{style}.ttf")
    print(f"wrote {OUT / f'PixelifySans-{style}.ttf'}")


# Silkscreen's grid: 125-unit pixels, 5 rows on the baseline, ink starting one pixel in.
SILKSCREEN_BOLD_PERCENT = ["##..##", "##.##.", "..##..", ".##.##", "##..##"]


def patch_silkscreen_bold() -> None:
    path = OUT / "Silkscreen-Bold.ttf"
    font = TTFont(path)
    cell = 125
    glyph = draw(SILKSCREEN_BOLD_PERCENT, cell, cell * 5, cell, cell, 0, 0)
    glyph.flags[0] |= 0x40
    font["glyf"][font.getBestCmap()[ord("%")]] = glyph
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = "Silkscreen Outside"
        elif record.nameID == 4:
            record.string = "Silkscreen Outside Bold"
        elif record.nameID == 6:
            record.string = "SilkscreenOutside-Bold"
    font.save(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    patch(Path(sys.argv[1]), 400, "Regular")
    patch(Path(sys.argv[1]), 700, "Bold")
    patch_silkscreen_bold()
