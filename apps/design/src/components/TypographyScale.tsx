import type { FunctionComponent } from "react";
import { useCopy } from "@/hooks/useCopy";

type TypographyItem = {
  name: string;
  className: string;
  usage: string;
  size: string;
  weight: string;
  mono?: boolean;
};

type Props = {
  items: TypographyItem[];
  title: string;
  description: string;
};

const TypographyScale: FunctionComponent<Props> = ({ items, title, description }) => {
  const { copied, handleCopy } = useCopy();

  return (
    <section className="space-y-5 md:space-y-6">
      <div>
        <h3 className="text-h3 font-semibold mb-2">{title}</h3>
        <p className="text-lychee-500 dark:text-lychee-400">{description}</p>
      </div>
      
      <div className="space-y-3 md:space-y-4">
        {items.map((item) => (
          <button
            key={item.className}
            type="button"
            onClick={() => handleCopy(item.className)}
            className="group relative w-full p-5 md:p-6 rounded-lg text-left bg-longan-100 dark:bg-longan-900 border border-longan-950/5 dark:border-lychee-50/5 transition-transform duration-150 ease-in-out hover:scale-[1.02] active:scale-100 cursor-copy"
          >
            <code className="absolute top-3 right-3 md:top-4 md:right-4 text-label text-lychee-500 dark:text-lychee-400 bg-longan-200 dark:bg-longan-800 px-2 py-1 rounded font-mono opacity-0 group-hover:opacity-100 transition-opacity">
              {item.className}
            </code>
            
            <h4 className="text-h4 font-semibold text-longan-900 dark:text-lychee-100">
              {item.name}
            </h4>
            <div className="flex gap-3 md:gap-4 text-body-sm text-lychee-500 dark:text-lychee-400 mt-1">
              <span>{item.size}</span>
              <span>•</span>
              <span>Weight {item.weight}</span>
            </div>
            
            <div className={`${item.className} ${item.mono ? 'font-mono' : ''} text-longan-900 dark:text-lychee-100`}>
              The quick brown fox jumps over the lazy dog
            </div>
            
            <p className="text-body-sm text-lychee-500 dark:text-lychee-400 mt-3">
              {item.usage}
            </p>
            
            {copied === item.className && (
              <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-longan-950/60">
                <div className="flex items-center gap-2 text-lychee-50">
                  <img src="src/assets/checkmark.svg" alt="Copied" width={24} height={24} />
                  <span className="text-body-sm font-medium">Copied!</span>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};

export default TypographyScale; 