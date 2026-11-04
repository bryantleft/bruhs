import { type BruhVariant, bruhGeometry } from "@bruhs/theme/logo";

type Props = {
  baseColor: string;
  eyeColor: string;
  mouthColor: string;
  variant: BruhVariant;
  className?: string;
};

export default function BruhsSVG({
  baseColor,
  eyeColor,
  mouthColor,
  variant,
  className = "",
}: Props) {
  const { base, eye, mouth, faces, viewBox } = bruhGeometry;
  const face = faces[variant];

  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`Bruhs logo, ${variant} variant`}
    >
      <circle cx={base.cx} cy={base.cy} r={base.r} fill={baseColor} />
      <ellipse cx={face.leftEye.x} cy={face.leftEye.y} rx={eye.rx} ry={eye.ry} fill={eyeColor} />
      <ellipse cx={face.rightEye.x} cy={face.rightEye.y} rx={eye.rx} ry={eye.ry} fill={eyeColor} />
      <ellipse cx={face.mouth.x} cy={face.mouth.y} rx={mouth.rx} ry={mouth.ry} fill={mouthColor} />
    </svg>
  );
}
