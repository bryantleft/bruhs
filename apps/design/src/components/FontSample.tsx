import type { FunctionComponent } from "react";
import { useCopy } from "@/hooks/useCopy";

type Props = {
    name: string;
    variable: string;
    className: string;
}

const FontSample: FunctionComponent<Props> = ({ name, variable, className }) => {
    const { copied, handleCopy } = useCopy();

    return (
        <button
            type="button"
            onClick={() => handleCopy(variable)}
            className={`group relative p-5 md:p-6 rounded-lg text-left bg-longan-100 dark:bg-longan-900 border border-longan-950/5 dark:border-lychee-50/5 transition-transform duration-150 ease-in-out hover:scale-[1.02] active:scale-100 cursor-copy ${className}`}>
            
            <code className="absolute top-3 right-3 md:top-4 md:right-4 text-code text-longan-500 dark:text-lychee-400 bg-longan-200 dark:bg-longan-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                {variable}
            </code>
            
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-h4 font-semibold">{name}</h3>
            </div>
            <p className="text-h2 font-light">The quick brown fox</p>
            <p className="text-body-lg mt-2">jumps over the lazy dog.</p>
            
            {copied === variable && (
                <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-longan-950/60">
                    <img src="src/assets/checkmark.svg" alt="Copied" width={24} height={24} />
                </div>
            )}
        </button>
    );
}

export default FontSample; 