import { useState, useRef, type FunctionComponent } from "react";
import type { LogoVariant } from "@/data/branding";
import { colorVariations } from "@/data/branding";
import { generateLogoSVG, getContrastingColors } from "@/utils/download";

type Props = {
  variants: LogoVariant[];
};

const LogoShowcase: FunctionComponent<Props> = ({ variants }) => {
  const [activeVariantIndex, setActiveVariantIndex] = useState<number>(1); 
  const [activeColor, setActiveColor] = useState(colorVariations[0]);

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
                  ? "bg-longan-900 text-lychee-100 ring-2 ring-lychee-100/50"
                  : "bg-longan-800/50 text-lychee-300 hover:bg-longan-800"
              }`}
              aria-label={`Switch to ${color.name} color`}
            >
              <span 
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-lychee-100/20" 
                style={{ backgroundColor: color.baseColor }}
              />
              <span className="hidden sm:inline">{color.name}</span>
            </button>
          ))}
          </div>
        </div>

        {/* Logo Display Area */}
        <div className="px-16 py-8 sm:px-20 sm:py-12 md:px-24 md:py-16 lg:px-32 lg:py-20">
          <div 
            className="relative mx-auto"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Main Logo */}
            <div className="flex items-center justify-center">
              <div 
                className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 transition-all duration-500 drop-shadow-2xl"
                dangerouslySetInnerHTML={{ 
                  __html: generateLogoSVG(
                    activeColor.baseColor, 
                    getContrastingColors(activeColor.baseColor).eyes, 
                    getContrastingColors(activeColor.baseColor).mouth, 
                    activeVariant.id as 'left' | 'original' | 'right'
                  ) 
                }}
              />
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={() => handleVariantChange((activeVariantIndex - 1 + variants.length) % variants.length)}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-longan-800/80 backdrop-blur-sm border border-lychee-100/10 flex items-center justify-center text-lychee-100/80 hover:text-lychee-100 hover:bg-longan-700/90 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-persimmon-400/50 cursor-pointer"
              aria-label={`Switch to ${prevVariant.name} variant`}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={() => handleVariantChange((activeVariantIndex + 1) % variants.length)}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-longan-800/80 backdrop-blur-sm border border-lychee-100/10 flex items-center justify-center text-lychee-100/80 hover:text-lychee-100 hover:bg-longan-700/90 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-persimmon-400/50 cursor-pointer"
              aria-label={`Switch to ${nextVariant.name} variant`}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Variant Info and Navigation */}
        <div className="p-4 sm:p-6 md:p-8 text-center">
          <div className="mb-4">
            <h3 className="text-h2 sm:text-h1 font-bold text-lychee-100 mb-2">{activeVariant.name}</h3>
            <p className="text-body sm:text-body-lg text-lychee-200">{activeVariant.description}</p>
            <p className="text-label text-lychee-300 mt-2">
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
                    : 'bg-lychee-100/30 hover:bg-lychee-100/60'
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