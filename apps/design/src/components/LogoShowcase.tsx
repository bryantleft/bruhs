import { type TouchEvent, useRef, useState } from "react";
import BruhsSVG from "@/components/BruhsSVG";
import CodeViewer from "@/components/CodeViewer";
import type { LogoVariant, ResolvedColorVariation } from "@/data/branding";
import { fillLogoCode } from "@/utils/logo-code";

type Props = {
  variants: LogoVariant[];
  colors: ResolvedColorVariation[];
  /** The logo component source with placeholders, plain and highlighted. */
  codeTemplate: { code: string; html: string };
};

export default function LogoShowcase({ variants, colors, codeTemplate }: Props) {
  const [activeVariantIndex, setActiveVariantIndex] = useState(1);
  const [activeColor, setActiveColor] = useState(colors[0]);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  const activeVariant = variants[activeVariantIndex];
  const prevIndex = (activeVariantIndex - 1 + variants.length) % variants.length;
  const nextIndex = (activeVariantIndex + 1) % variants.length;

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50) setActiveVariantIndex(nextIndex);
    if (distance < -50) setActiveVariantIndex(prevIndex);
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const codeValues = {
    baseColor: activeColor.baseColor,
    eyeColor: activeColor.eyeColor,
    mouthColor: activeColor.mouthColor,
    variant: activeVariant.id,
  };

  return (
    <section className="space-y-6">
      <div className="rounded-pomelo overflow-hidden">
        {/* Color Variation Selector */}
        <div className="p-4 sm:p-6 md:p-8">
          <div className="flex flex-wrap gap-2 justify-center max-w-4xl mx-auto">
          {colors.map((color) => (
            <button
              type="button"
              key={color.id}
              onClick={() => setActiveColor(color)}
              aria-pressed={activeColor.id === color.id}
              className={`px-3 py-2 sm:px-4 sm:py-2 rounded-grape text-label transition-all flex items-center gap-2 ${
                activeColor.id === color.id
                  ? "bg-longan-900 text-rambutan-100 ring-2 ring-rambutan-100/50"
                  : "bg-longan-800/50 text-rambutan-300 hover:bg-longan-800"
              }`}
              aria-label={`Switch to ${color.name} color`}
            >
              <span 
                className="w-3 h-3 sm:w-4 sm:h-4 rounded-orb border border-rambutan-100/20" 
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
            <div className="inline-flex rounded-grape bg-longan-800/50 p-1 border border-rambutan-100/10">
              <button
                type="button"
                aria-pressed={viewMode === "preview"}
                onClick={() => setViewMode('preview')}
                className={`px-4 py-2 rounded-grape text-sm font-medium transition-all ${
                  viewMode === 'preview'
                    ? 'bg-persimmon-500 text-longan-950'
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
                type="button"
                aria-pressed={viewMode === "code"}
                onClick={() => setViewMode('code')}
                className={`px-4 py-2 rounded-grape text-sm font-medium transition-all ${
                  viewMode === 'code'
                    ? 'bg-persimmon-500 text-longan-950'
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
                    eyeColor={activeColor.eyeColor}
                    mouthColor={activeColor.mouthColor}
                    variant={activeVariant.id}
                    className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 transition-all duration-500"
                  />
                </div>

                {/* Navigation Arrows */}
                <button
                  type="button"
                  onClick={() => setActiveVariantIndex(prevIndex)}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-orb bg-longan-800/80 backdrop-blur-sm border border-rambutan-100/10 flex items-center justify-center text-rambutan-100/80 hover:text-rambutan-100 hover:bg-longan-700/90 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-persimmon-400/50 cursor-pointer"
                  aria-label={`Switch to ${variants[prevIndex].name} variant`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveVariantIndex(nextIndex)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-orb bg-longan-800/80 backdrop-blur-sm border border-rambutan-100/10 flex items-center justify-center text-rambutan-100/80 hover:text-rambutan-100 hover:bg-longan-700/90 transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-persimmon-400/50 cursor-pointer"
                  aria-label={`Switch to ${variants[nextIndex].name} variant`}
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
                code={fillLogoCode(codeTemplate.code, codeValues, { html: false })}
                html={fillLogoCode(codeTemplate.html, codeValues, { html: true })}
                title={`${activeVariant.name} - ${activeColor.name}`}
              />
            </div>
          )}
        </div>

        {/* Variant Info and Navigation */}
        <div className="p-4 sm:p-6 md:p-8 text-center">
          <div className="mb-4">
            <h3 className="text-h2 sm:text-h1 font-semibold text-rambutan-100 mb-2">{activeVariant.name}</h3>
            <p className="text-body sm:text-body-lg text-rambutan-200">{activeVariant.description}</p>
            <p className="text-label text-rambutan-300 mt-2">
              {activeColor.name} Variant
            </p>
          </div>
          
          {/* Navigation Dots */}
          <div className="flex justify-center space-x-3">
            {variants.map((variant, index) => (
              <button
                type="button"
                key={variant.id}
                onClick={() => setActiveVariantIndex(index)}
                aria-current={index === activeVariantIndex ? "true" : undefined}
                className={`w-3 h-3 rounded-orb transition-all duration-300 ${
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
}
