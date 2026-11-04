import { bruhGeometry } from "@bruhs/theme/logo";

/** Values substituted into the copy-paste logo component. */
export type LogoCodeValues = {
  baseColor: string;
  eyeColor: string;
  mouthColor: string;
  variant: string;
};

/** Placeholders used to highlight the sample once at build time. */
export const LOGO_CODE_PLACEHOLDERS: LogoCodeValues = {
  baseColor: "__BASE_COLOR__",
  eyeColor: "__EYE_COLOR__",
  mouthColor: "__MOUTH_COLOR__",
  variant: "__VARIANT__",
};

const point = ({ x, y }: { x: number; y: number }) => `{ x: ${x}, y: ${y} }`;

/**
 * A self-contained React component that draws the logo. Generated from the theme's
 * geometry so it can't drift, but it has no dependencies, so it can be pasted anywhere.
 */
export function buildLogoCode(values: LogoCodeValues): string {
  const { base, eye, mouth, faces, viewBox } = bruhGeometry;
  const faceLines = Object.entries(faces)
    .map(
      ([name, face]) =>
        `    ${name}: { leftEye: ${point(face.leftEye)}, rightEye: ${point(face.rightEye)}, mouth: ${point(face.mouth)} },`,
    )
    .join("\n");

  return `const BruhsSVG = ({
  baseColor = "${values.baseColor}",
  eyeColor = "${values.eyeColor}",
  mouthColor = "${values.mouthColor}",
  variant = "${values.variant}",
  className = "w-32 h-32",
}) => {
  const faces = {
${faceLines}
  };
  const face = faces[variant] ?? faces.original;

  return (
    <svg viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="${base.cx}" cy="${base.cy}" r="${base.r}" fill={baseColor} />
      <ellipse cx={face.leftEye.x} cy={face.leftEye.y} rx="${eye.rx}" ry="${eye.ry}" fill={eyeColor} />
      <ellipse cx={face.rightEye.x} cy={face.rightEye.y} rx="${eye.rx}" ry="${eye.ry}" fill={eyeColor} />
      <ellipse cx={face.mouth.x} cy={face.mouth.y} rx="${mouth.rx}" ry="${mouth.ry}" fill={mouthColor} />
    </svg>
  );
};

export default BruhsSVG;`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Put real values into the placeholder code. With `html`, the template is highlighted
 * markup and the values are HTML-escaped.
 */
export function fillLogoCode(
  template: string,
  values: LogoCodeValues,
  { html }: { html: boolean },
): string {
  let out = template;
  for (const key of Object.keys(values) as (keyof LogoCodeValues)[]) {
    const value = html ? escapeHtml(values[key]) : values[key];
    out = out.replaceAll(LOGO_CODE_PLACEHOLDERS[key], value);
  }
  return out;
}
