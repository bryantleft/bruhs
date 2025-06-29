import type { FunctionComponent } from "preact";
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
            className={`relative p-6 rounded-lg text-left bg-longan-100 dark:bg-longan-900 border border-longan-950/5 dark:border-lychee-50/5 transition-transform duration-150 ease-in-out hover:scale-[1.02] active:scale-100 cursor-copy ${className}`}>
            
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{name}</h3>
            </div>
            <p className="text-4xl font-light">The quick brown fox</p>
            <p className="text-lg mt-2">jumps over the lazy dog.</p>
            <p className="text-sm mt-4 text-longan-500 dark:text-lychee-400 font-mono">{variable}</p>
            
            {copied === variable && (
                <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-longan-950/60">
                    <img src="src/assets/checkmark.svg" alt="Copied" width={24} height={24} />
                </div>
            )}
        </button>
    );
}

export default FontSample; 