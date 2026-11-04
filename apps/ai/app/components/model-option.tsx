import { ProviderInfo } from "@/lib/data";
import { InputType, type Model, OutputType } from "@/lib/types";

function TextIcon({ label }: { label: string }) {
  return (
    <span
      title={label}
      className="rounded-seed border-longan-700 bg-longan-900 inline-flex items-center justify-center border p-0.5"
    >
      <span
        aria-hidden="true"
        className="iconify lucide--type text-rambutan-400 h-3 w-3"
      />
    </span>
  );
}

/** Logo, name and text-in/text-out icons for one model, used in lists. */
export function ModelOption({ model }: { model: Model }) {
  return (
    <>
      <img
        src={ProviderInfo[model.provider].logo}
        alt=""
        width={20}
        height={20}
        className="rounded-seed select-none"
      />
      <span className="flex items-center gap-1">{model.name}</span>
      <span aria-hidden="true" className="ml-auto flex items-center gap-1">
        {model.inputs.includes(InputType.TEXT) && <TextIcon label="Text in" />}
        <span className="iconify lucide--arrow-right text-rambutan-500 h-3 w-3" />
        {model.outputs.includes(OutputType.TEXT) && (
          <TextIcon label="Text out" />
        )}
      </span>
    </>
  );
}
