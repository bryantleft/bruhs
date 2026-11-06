#!/usr/bin/env node
/**
 * Pith's logo: the bruh mascot as a lemon slice. Everything here is generated from the bruhs
 * colour tokens (packages/ui/src/styles/index.css) and the shared mascot geometry
 * (packages/ui/src/lib/logo.ts), so the icon can't drift from the brand.
 *
 *   node scripts/brand.mjs          write native/Brand/
 *   node scripts/brand.mjs --check  fail if native/Brand/ differs from what the tokens produce
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bruhGeometry } from "../../../packages/ui/src/lib/logo.ts";
import { parseColorTokens, toRgb } from "../../../packages/ui/src/lib/oklch.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "native/Brand");
const css = readFileSync(path.join(root, "../../packages/ui/src/styles/index.css"), "utf8");

const tokens = parseColorTokens(css);
function rgb(name, space) {
  const token = tokens.get(name);
  if (!token) throw new Error(`Brand colour --color-${name} is missing from index.css.`);
  return toRgb(token, space);
}
const hex = (name) => `#${rgb(name, "srgb").map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
const p3 = (name) => `display-p3:${rgb(name, "p3").map((v) => v.toFixed(5)).join(",")},1.00000`;

const color = {
  rind: hex("bruh-base"), pith: hex("rambutan-50"), flesh: hex("durian-400"), fleshAlt: hex("durian-300"),
  eye: hex("bruh-eye"), mouth: hex("bruh-mouth"), text: hex("rambutan-50"),
};

// Slice proportions on a 1024 pt icon canvas.
const CANVAS = 1024, CENTER = 512, R = 372;
const SLICE = { pith: 0.92, flesh: 0.875, core: 0.075, segments: 10, gapDegrees: 2.6 };
// The mascot's features are 10 units tall on a 300-unit face, which is under a pixel at small
// icon sizes. The icon draws them 14 units tall so the face survives down to 32 px.
const FEATURE_RY = 14;

const f = (n) => Number(n.toFixed(2));
function face(cx, cy, radius, ry = FEATURE_RY) {
  const { base, eye, mouth, faces } = bruhGeometry;
  const k = radius / base.r, at = (p) => [f(cx + (p.x - base.cx) * k), f(cy + (p.y - base.cy) * k)];
  const { leftEye, rightEye, mouth: m } = faces.original;
  return [
    ...[leftEye, rightEye].map((p) => ({ c: at(p), rx: f(eye.rx * k), ry: f(ry * k), fill: color.eye })),
    { c: at(m), rx: f(mouth.rx * k), ry: f(ry * k), fill: color.mouth },
  ];
}
function wedge(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => { const t = ((a - 90) * Math.PI) / 180; return `${f(cx + r * Math.cos(t))} ${f(cy + r * Math.sin(t))}`; };
  return `M${p(r1, a0)}A${f(r1)} ${f(r1)} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${f(r0)} ${f(r0)} 0 0 0 ${p(r0, a0)}Z`;
}
function sliceShapes(cx, cy, radius) {
  const step = 360 / SLICE.segments, half = SLICE.gapDegrees / 2;
  const segments = Array.from({ length: SLICE.segments }, (_, i) =>
    `<path d="${wedge(cx, cy, radius * SLICE.core, radius * SLICE.flesh, i * step + half, (i + 1) * step - half)}" fill="${i % 2 ? color.fleshAlt : color.flesh}"/>`);
  return [
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color.rind}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${f(radius * SLICE.pith)}" fill="${color.pith}"/>`,
    ...segments,
  ].join("\n  ");
}
const faceShapes = (cx, cy, radius) =>
  face(cx, cy, radius).map((e) => `<ellipse cx="${e.c[0]}" cy="${e.c[1]}" rx="${e.rx}" ry="${e.ry}" fill="${e.fill}"/>`).join("\n  ");
const svg = (w, h, body, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>\n  ${body}\n</svg>\n`;

// "pith" in Monaspace Krypton at weight 500 with -0.03 em tracking, outlined with fontTools from
// packages/ui/fonts/MonaspaceKryptonVariable.woff (2000 units per em, baseline at y = 0).
const WORD = {
  advance: 4780,
  d: "M156.5 -1041.0H310L371.0 -883.5V-131.5L383.5 -82.5V370.0L156.5 400.0ZM274.0 -178.5H679.5L878.5 -382.0V-726.5L728.5 -853.0L274.0 -752.5V-896L799.5 -1064.5L1102.5 -786.5V-312.5L779 0H274ZM1780.0 -887 1832.5 -841.5H1341.0L1366.0 -1041H1881.5L2004.5 -901.0V0.0H1780.0ZM1670.0 -1423.5 1848.0 -1593 2025.5 -1423.5 1848.0 -1253.5ZM2700.5 -303.0V-1276.0L2921.0 -1316V-375L3070.5 -189.0H3434.5V0.5H2957.5ZM2458.0 -935.5H3434.5V-756.5H2458.0ZM4388.0 -738.5 4263.5 -865.0 3798.0 -764.5V-896L4344.5 -1064.5L4611.5 -791.5L4613.5 0.0H4388.0ZM3706.5 -1490.0 3931.0 -1530V0H3706.5Z",
};

const files = {
  "AppIcon.icon/icon.json": `${JSON.stringify({
    fill: { "linear-gradient": [p3("longan-800"), p3("longan-950")] },
    groups: [
      { "blur-material": null, layers: [{ glass: false, "image-name": "face.svg", name: "face", position: { scale: 1, "translation-in-points": [0, 0] } }],
        shadow: { kind: "neutral", opacity: 0.35 }, specular: false, translucency: { enabled: false, value: 0.5 } },
      { "blur-material": null, layers: [{ glass: false, "image-name": "slice.svg", name: "slice", position: { scale: 1, "translation-in-points": [0, 0] } }],
        shadow: { kind: "neutral", opacity: 0.5 }, specular: true, translucency: { enabled: false, value: 0.5 } },
    ],
    "supported-platforms": { squares: ["macOS"] },
  }, null, 2)}\n`,
  "AppIcon.icon/Assets/slice.svg": svg(CANVAS, CANVAS, sliceShapes(CENTER, CENTER, R)),
  "AppIcon.icon/Assets/face.svg": svg(CANVAS, CANVAS, faceShapes(CENTER, CENTER, R)),
  // The mark on its own: docs, the wordmark, anywhere the system doesn't draw the icon shape.
  "pith-mark.svg": svg(800, 800, `${sliceShapes(400, 400, 400)}\n  ${faceShapes(400, 400, 400)}`),
  // Menu bar template image: drawn in black, knocked-out features; AppKit tints it.
  "StatusGlyph.svg": (() => {
    const c = 16, r = 14.5;
    const holes = face(c, c, r, 27).map((e) => {
      const [x, y] = e.c, rx = Math.max(e.rx, 2.6);
      return `M${f(x - rx)} ${y}a${rx} ${e.ry} 0 1 0 ${f(rx * 2)} 0a${rx} ${e.ry} 0 1 0 ${f(-rx * 2)} 0Z`;
    }).join("");
    return svg(32, 32, `<path fill-rule="evenodd" d="M${c - r} ${c}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z${holes}"/>`);
  })(),
  "pith-wordmark.svg": (() => {
    const D = 1900, gap = 340, top = -1520, bottom = 420, cy = -560;
    const width = D + gap + WORD.advance, height = bottom - top;
    return svg(width, height, `<g transform="translate(0 ${-top})">\n  ${sliceShapes(D / 2, cy, D / 2)}\n  ${faceShapes(D / 2, cy, D / 2)}\n  <path transform="translate(${D + gap} 0)" fill="${color.text}" d="${WORD.d}"/>\n  </g>`);
  })(),
};

const check = process.argv.includes("--check");
const stale = [];
for (const [name, content] of Object.entries(files)) {
  const target = path.join(out, name);
  if (check) {
    let current = null;
    try { current = readFileSync(target, "utf8"); } catch {}
    if (current !== content) stale.push(name);
  } else {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
if (stale.length) {
  console.error(`Pith brand assets are out of date with the bruhs tokens: ${stale.join(", ")}.\nRun \`node scripts/brand.mjs\` in apps/storage and commit the result.`);
  process.exit(1);
}
console.log(check ? `brand: ${Object.keys(files).length} assets match the bruhs tokens` : `brand: wrote ${Object.keys(files).length} assets to native/Brand`);
