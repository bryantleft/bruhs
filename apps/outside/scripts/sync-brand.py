"""Convert the shared Bruhs OKLCH tokens to sRGB for native React Native views."""
import math
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SOURCE = APP.parents[1] / 'packages/ui/src/styles/index.css'


def srgb(lightness: float, chroma: float, hue: float) -> str:
    angle = math.radians(hue)
    a, b = chroma * math.cos(angle), chroma * math.sin(angle)
    l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    channels = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
    encoded = [12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055 for c in channels]
    return '#' + ''.join(f'{round(max(0, min(1, c)) * 255):02x}' for c in encoded)


tokens = re.findall(r'--color-([\w-]+): oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)', SOURCE.read_text())
output = '// Generated from packages/ui/src/styles/index.css by pnpm sync:brand.\n'
output += 'export const palette = {\n'
for name, lightness, chroma, hue in tokens:
    output += f"  '{name}': '{srgb(float(lightness), float(chroma), float(hue))}',\n"
output += '} as const;\n'
(APP / 'src/theme/palette.ts').write_text(output)
