import { useState, useRef, useMemo, type FunctionComponent } from "react";
import type { LogoVariant } from "@/data/branding";
import { colorVariations } from "@/data/branding";
import { getContrastingColors } from "@/utils/download";
import CodeViewer from "@/components/CodeViewer";
import BruhsSVG from "@/components/BruhsSVG";

type Props = {
  variants: LogoVariant[];
};

const LogoShowcase: FunctionComponent<Props> = ({ variants }) => {
  const [activeVariantIndex, setActiveVariantIndex] = useState<number>(1); 
  const [activeColor, setActiveColor] = useState(colorVariations[0]);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  const activeVariant = variants[activeVariantIndex];
  const prevVariant = variants[(activeVariantIndex - 1 + variants.length) % variants.length];
  const nextVariant = variants[(activeVariantIndex + 1) % variants.length];

  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const handleVariantChange = (newIndex: number) => {
    setActiveVariantIndex(newIndex);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      handleVariantChange((activeVariantIndex + 1) % variants.length);
    }
    if (isRightSwipe) {
      handleVariantChange((activeVariantIndex - 1 + variants.length) % variants.length);
    }

    touchStartX.current = 0;
    touchEndX.current = 0;
  }; 

  // Memoize contrasting colors to avoid recalculation
  const contrastingColors = useMemo(() => 
    getContrastingColors(activeColor.baseColor), 
    [activeColor.baseColor]
  );

  const codeExample = useMemo(() => {
    return `import React from 'react';

const BruhsSVG = ({ 
  baseColor = "${activeColor.baseColor}", 
  eyeColor = "${contrastingColors.eyes}", 
  mouthColor = "${contrastingColors.mouth}", 
  variant = "${activeVariant.id}",
  className = "w-32 h-32",
  style = {}
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

  const eyes = eyePositions[variant] || eyePositions.original;
  const mouth = mouthPositions[variant] || mouthPositions.original;

  return (
    <svg 
      viewBox="0 0 600 600" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <circle cx="300" cy="300" r="300" fill={baseColor} />
      <ellipse cx={eyes.left.x} cy={eyes.left.y} rx="40" ry="10" fill={eyeColor} />
      <ellipse cx={eyes.right.x} cy={eyes.right.y} rx="40" ry="10" fill={eyeColor} />
      <ellipse cx={mouth.x} cy={mouth.y} rx="120" ry="10" fill={mouthColor} />
    </svg>
  );
};

export default BruhsSVG;`;
  }, [activeColor, activeVariant, contrastingColors]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl overflow-hidden">
        {/* Color Variation Selector */}
        <div className="p-4 sm:p-6 md:p-8">
          <div className="flex flex-wrap gap-2 justify-center max-w-4xl mx-auto">
          {colorVariations.map((color) => (
            <button
              key={color.id}
              onClick={() => setActiveColor(color)}
              className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-label transition-all flex items-center gap-2 ${
                activeColor.id === color.id
                  ? "bg-longan-900 text-rambutan-100 ring-2 ring-rambutan-100/50"
                  : "bg-longan-800/50 text-rambutan-300 hover:bg-longan-800"
              }`}
              aria-label={`Switch to ${color.name} color`}
            >
              <span 
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-rambutan-100/20" 
                style={{ backgroundColor: color.baseColor }}
              />
              <span className="hidden sm:inline">{color.name}</span>
            </button>
          ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="px-4 sm:px-6 md:px-8 pb-4 sm:pb-6 md:pb-8">
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg bg-longan-800/50 p-1 border border-rambutan-100/10">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'preview'
                    ? 'bg-persimmon-500 text-white shadow-sm'
                    : 'text-rambutan-300 hover:text-rambutan-100 hover:bg-longan-800/50'
                }`}
              >
                <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'code'
                    ? 'bg-persimmon-500 text-white shadow-sm'
                    : 'text-rambutan-300 hover:text-rambutan-100 hover:bg-longan-800/50'
                }`}
              >
                <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Code
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="px-4 sm:px-6 md:px-8 pb-8">
          {viewMode === 'preview' ? (
            <div className="px-12 py-8 sm:px-16 sm:py-12 md:px-20 md:py-16 lg:px-28 lg:py-20">
              <div 
                className="relative mx-auto"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Main Logo */}
                <div className="flex items-center justify-center">
                  <BruhsSVG
                    baseColor={activeColor.baseColor}
                    eyeColor={contrastingColors.eyes}
                    mouthColor={contrastingColors.mouth}
                    variant={activeVariant.id as 'left' | 'original' | 'right'}
                    className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 transition-all duration-500 drop-shadow-2xl"
                  />
                </div>

                {/* Navigation Arrows */}
                <button
                  onClick={() => handleVariantChange((activeVariantIndex - 1 + variants.length) % variants.length)}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-longan-800/80 backdrop-blur-sm border border-rambutan-100/10 flex items-center justify-center text-rambutan-100/80 hover:text-rambutan-100 hover:bg-longan-700/90 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-persimmon-400/50 cursor-pointer"
                  aria-label={`Switch to ${prevVariant.name} variant`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <button
                  onClick={() => handleVariantChange((activeVariantIndex + 1) % variants.length)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-longan-800/80 backdrop-blur-sm border border-rambutan-100/10 flex items-center justify-center text-rambutan-100/80 hover:text-rambutan-100 hover:bg-longan-700/90 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-persimmon-400/50 cursor-pointer"
                  aria-label={`Switch to ${nextVariant.name} variant`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              <CodeViewer
                code={codeExample}
                language="tsx"
                title={`${activeVariant.name} - ${activeColor.name}`}
              />
            </div>
          )}
        </div>

        {/* Variant Info and Navigation */}
        <div className="p-4 sm:p-6 md:p-8 text-center">
          <div className="mb-4">
            <h3 className="text-h2 sm:text-h1 font-bold text-rambutan-100 mb-2">{activeVariant.name}</h3>
            <p className="text-body sm:text-body-lg text-rambutan-200">{activeVariant.description}</p>
            <p className="text-label text-rambutan-300 mt-2">
              {activeColor.name} Variant
            </p>
          </div>
          
          {/* Navigation Dots */}
          <div className="flex justify-center space-x-3">
            {variants.map((variant, index) => (
              <button
                key={variant.id}
                onClick={() => handleVariantChange(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === activeVariantIndex
                    ? 'bg-persimmon-500 scale-125'
                    : 'bg-rambutan-100/30 hover:bg-rambutan-100/60'
                }`}
                aria-label={`Switch to ${variant.name} variant`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LogoShowcase;