import type { FunctionComponent } from "react";
import type { ColorGroup } from "@/components/ColorCard";
import { useCopy } from "@/hooks/useCopy";

type Props = {
    color: ColorGroup
}

const NeutralColorRow: FunctionComponent<Props> = ({ color }) => {
    const { copied, handleCopy } = useCopy();

    return (
        <div>
            <h3 className="text-xl font-semibold mb-4 text-longan-800 dark:text-lychee-200">{color.name}</h3>
            <div className="flex flex-col gap-1">
                {color.swatches.map(swatch => {
                    const isDark = parseInt(swatch.variable.split('-').pop() || "0", 10) > 500;
                    const textColor = isDark ? 'text-lychee-50' : 'text-longan-950';
                    const subTextColor = isDark ? 'text-lychee-400' : 'text-longan-500';

                    return (
                        <button
                            key={swatch.variable}
                            type="button"
                            onClick={() => handleCopy(swatch.variable)}
                            className={`relative group flex items-center justify-between p-3 rounded-lg text-left transition-transform duration-150 ease-in-out hover:scale-[1.02] active:scale-100 cursor-copy ${swatch.className}`}
                        >
                            <div className="flex items-center gap-4">
                                <p className={`font-mono text-sm font-medium ${textColor}`}>
                                    {swatch.name.split(' ').pop()}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <p className={`font-mono text-sm ${subTextColor}`}>{swatch.variable}</p>
                            </div>

                            {copied === swatch.variable && (
                                <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-longan-950/60">
                                    <img src="src/assets/checkmark.svg" alt="Copied" width={24} height={24} />
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    );
}

export default NeutralColorRow; 