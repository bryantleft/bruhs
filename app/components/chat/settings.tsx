import Select from "@/components/chat/select";
import { useLLMStore } from "@/lib/stores";
import { Provider } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type ChangeEvent, useEffect, useState } from "react";

// TODO: decouple from chat
// TODO: provide links for key access ease

export default function Settings() {
  const { keys, model, addKey, removeKey } = useLLMStore();
  const initialKey = keys ? (keys[model.provider] ?? "") : "";
  const [apiKey, setApiKey] = useState(initialKey);

  useEffect(() => {
    const key = keys ? (keys[model.provider] ?? "") : "";
    setApiKey(key);
  }, [keys, model]);

  const canAddKey = () => {
    return apiKey.length > 0;
  };

  const handleKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
  };

  const handleAddKey = () => {
    if (apiKey) {
      addKey(model.provider, apiKey);
    }
  };

  const handleRemoveKey = () => {
    removeKey(model.provider);
  };

  return (
    <div className="flex w-full justify-between">
      <Select />
      <div
        className={cn(
          "relative w-2/5 overflow-hidden rounded",
          "border-[0.5px] border-platinum-900 transition-colors duration-300",
          initialKey
            ? "cursor-not-allowed"
            : "cursor-text hover:border-platinum-700",
        )}
      >
        <input
          type="password"
          value={apiKey}
          onChange={handleKeyChange}
          placeholder={model.provider === Provider.XAI ? "xai-..." : "sk-..."}
          className={cn(
            "h-full w-full rounded py-3 pr-8 pl-4",
            "bg-platinum-950 text-platinum-400 text-xs placeholder:text-platinum-400",
            "transition-opacity duration-300 focus:outline-none",
            initialKey
              ? "cursor-not-allowed opacity-50"
              : "cursor-text opacity-100",
          )}
          disabled={!!initialKey}
          autoComplete={"off"}
        />
        <div
          className={cn(
            "absolute inset-y-0 z-20 flex items-center",
            "transition-all duration-300",
            !initialKey
              ? "right-0 pr-3 opacity-100"
              : "pointer-events-none right-[calc(50%-12px)] opacity-0",
          )}
        >
          <button
            type="button"
            onMouseDown={handleAddKey}
            className={cn(
              "flex rounded-lg p-[5px] transition-colors duration-300",
              canAddKey()
                ? "cursor-pointer bg-amethyst-700 hover:bg-amethyst-600"
                : "cursor-not-allowed",
              initialKey && "bg-amethyst",
            )}
            disabled={!canAddKey()}
          >
            <span className="iconify lucide--lock-open h-3 w-3 text-onyx-300" />
          </button>
        </div>
        <div
          className={cn(
            "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-10 transform",
            "transition-all duration-300",
            initialKey ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <div className="flex cursor-not-allowed rounded-lg bg-amethyst-700 p-[5px]">
            <span className="iconify lucide--lock h-3 w-3 text-onyx-300" />
          </div>
        </div>
        <div
          className={cn(
            "absolute inset-y-0 right-0 z-20 flex items-center pr-3",
            "transition-opacity duration-300",
            initialKey ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <button
            type="button"
            onMouseDown={handleRemoveKey}
            className="flex cursor-pointer rounded-lg p-[5px] *:hover:text-ruby-700 focus:outline-none"
          >
            <span className="iconify lucide--trash h-3 w-3 text-platinum-400 transition-colors duration-300" />
          </button>
        </div>
      </div>
    </div>
  );
}
