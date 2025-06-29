import type { FunctionComponent } from "react";
import { useCopy } from "@/hooks/useCopy";

type Swatch = {
  name: string;
  variable: string;
  className: string;
};

export type ColorGroup = {
  name: string;
  prefix: string;
  swatches: Swatch[];
};

type Props = {
    color: ColorGroup;
}

const ColorCard: FunctionComponent<Props> = ({ color }) => {
  const { copied, handleCopy } = useCopy();
  const mainSwatch = color.swatches.find(s => s.name.endsWith("500"));

  return (
    <div className="relative group rounded-xl overflow-hidden shadow-sm border border-longan-950/5 dark:border-lychee-50/5 bg-lychee-50 dark:bg-longan-950">
      <div className={`h-24 w-full ${mainSwatch?.className} flex items-center justify-center`}>
        <h3 className="text-2xl font-bold text-lychee-50/80 drop-shadow-lg" style={{fontFeatureSettings: "'ss01'"}}>{color.name}</h3>
      </div>
      <div className="p-4">
        <div className="flex flex-row rounded-lg overflow-hidden border border-longan-950/10 dark:border-lychee-50/10">
          {color.swatches.map(swatch => (
            <button
              key={swatch.variable}
              type="button"
              className={`relative group h-10 flex-1 transition-all duration-150 ease-in-out focus:outline-none focus:z-10 hover:-translate-y-1 hover:shadow-lg cursor-copy ${swatch.className}`}
              onClick={() => handleCopy(swatch.variable)}
              aria-label={`Copy ${swatch.variable}`}
            >
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-longan-800 text-lychee-50 text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                {swatch.name.split(' ').pop()}
              </span>
              {copied === swatch.variable && (
                 <span className="absolute inset-0 flex items-center justify-center bg-longan-950/50">
                    <img src="src/assets/checkmark.svg" alt="Copied" width={24} height={24} />
                 </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ColorCard; 