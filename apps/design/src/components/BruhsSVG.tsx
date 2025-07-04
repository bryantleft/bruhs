import React from 'react';

interface BruhsSVGProps {
  baseColor: string;
  eyeColor: string;
  mouthColor: string;
  variant: 'left' | 'original' | 'right';
  className?: string;
}

const BruhsSVG: React.FC<BruhsSVGProps> = ({
  baseColor,
  eyeColor,
  mouthColor,
  variant,
  className = ""
}) => {
  const eyePositions = {
    left: { left: { x: 97, y: 209 }, right: { x: 300, y: 209 } },
    original: { left: { x: 198, y: 223 }, right: { x: 401, y: 223 } },
    right: { left: { x: 300, y: 209 }, right: { x: 503, y: 209 } }
  };
  
  const mouthPositions = {
    left: { x: 191, y: 364 },
    original: { x: 307, y: 378 },
    right: { x: 409, y: 364 }
  };

  const eyes = eyePositions[variant];
  const mouth = mouthPositions[variant];

  return (
    <svg 
      viewBox="0 0 600 600" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="300" cy="300" r="300" fill={baseColor} />
      <ellipse cx={eyes.left.x} cy={eyes.left.y} rx="40" ry="10" fill={eyeColor} />
      <ellipse cx={eyes.right.x} cy={eyes.right.y} rx="40" ry="10" fill={eyeColor} />
      <ellipse cx={mouth.x} cy={mouth.y} rx="120" ry="10" fill={mouthColor} />
    </svg>
  );
};

export default BruhsSVG;