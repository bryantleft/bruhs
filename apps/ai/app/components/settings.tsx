import { useId, useState } from "react";
import { ModelOption } from "@/components/model-option";
import { models } from "@/lib/data";
import { useDisclosure } from "@/lib/hooks/use-disclosure";
import { useLLMStore, useModel } from "@/lib/stores";
import { type Model, Provider } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Settings() {
  const model = useModel();
  const setModel = useLLMStore((s) => s.setModel);
  const { isOpen, setIsOpen, ref } = useDisclosure();
  const panelId = useId();

  return (
    <div
      ref={ref}
      className={cn(
        "group",
        "rounded-grape bg-longan-800 p-2 inset-ring inset-ring-white/10",
        "text-rambutan-200 hover:inset-ring-white/20",
        "transition-all duration-300 ease-in-out",
        isOpen
          ? "w-56"
          : "w-[34px] hover:w-[110px] has-focus-visible:w-[110px]",
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label="Settings"
          className="rounded-seed focus-visible:outline-persimmon-400 flex w-full cursor-pointer items-center justify-between focus-visible:outline-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              "overflow-hidden text-sm font-semibold whitespace-nowrap transition-all duration-300 ease-in-out",
              isOpen
                ? "max-w-full opacity-100"
                : "max-w-0 opacity-0 group-hover:max-w-full group-hover:opacity-100",
            )}
          >
            Settings
          </span>
          <span
            aria-hidden="true"
            className="iconify lucide--settings text-rambutan-200 h-4 w-4"
          />
        </button>
      </div>

      <div
        id={panelId}
        // Closed: collapsed and inert, so its controls leave the tab order.
        inert={!isOpen}
        className={cn(
          "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "mt-3 max-h-[32rem] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <fieldset className="mb-4">
          <legend className="text-rambutan-400 mb-2 text-xs font-medium">
            Model
          </legend>
          <div className="space-y-1">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m)}
                aria-pressed={model.id === m.id}
                className={cn(
                  "rounded-seed flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors duration-200",
                  "focus-visible:outline-persimmon-400 focus-visible:outline-2",
                  model.id === m.id
                    ? "bg-blueberry-500/20 text-blueberry-100 cursor-default font-semibold"
                    : "text-rambutan-400 hover:bg-longan-700 hover:text-rambutan-200 cursor-pointer",
                )}
              >
                <ModelOption model={m} />
              </button>
            ))}
          </div>
        </fieldset>

        {/* Remount per provider so the field starts from that provider's saved key. */}
        <ApiKeyField key={model.provider} model={model} />
      </div>
    </div>
  );
}

function ApiKeyField({ model }: { model: Model }) {
  const savedKey = useLLMStore((s) => s.keys[model.provider]);
  const addKey = useLLMStore((s) => s.addKey);
  const removeKey = useLLMStore((s) => s.removeKey);
  const rememberKeys = useLLMStore((s) => s.rememberKeys);
  const setRememberKeys = useLLMStore((s) => s.setRememberKeys);
  const [apiKey, setApiKey] = useState(savedKey ?? "");
  const inputId = useId();
  const rememberId = useId();
  const isSaved = savedKey !== undefined;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="text-rambutan-400 mb-2 block text-xs font-medium"
      >
        API key ({model.provider})
      </label>
      <div className="rounded-seed border-longan-900 hover:border-longan-700 relative w-full overflow-hidden border-[0.5px] transition-colors duration-300">
        <input
          id={inputId}
          type="password"
          value={isSaved ? savedKey : apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={model.provider === Provider.XAI ? "xai-..." : "sk-..."}
          className={cn(
            "rounded-seed h-full w-full py-2 pr-8 pl-3",
            "bg-longan-950 text-rambutan-300 placeholder:text-rambutan-500 text-xs",
            "focus-visible:inset-ring-persimmon-400 focus:outline-none focus-visible:inset-ring",
            isSaved && "cursor-not-allowed opacity-50",
          )}
          disabled={isSaved}
          autoComplete="off"
        />
        <div className="absolute inset-y-0 right-0 z-20 flex items-center pr-2">
          {isSaved ? (
            <button
              type="button"
              onClick={() => {
                removeKey(model.provider);
                setApiKey("");
              }}
              aria-label={`Remove the ${model.provider} API key`}
              className="rounded-seed text-rambutan-400 hover:text-lychee-400 focus-visible:outline-persimmon-400 flex cursor-pointer p-[5px] transition-colors duration-300 focus-visible:outline-2"
            >
              <span
                aria-hidden="true"
                className="iconify lucide--trash h-3 w-3"
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => addKey(model.provider, apiKey)}
              disabled={apiKey.length === 0}
              aria-label={`Save the ${model.provider} API key`}
              className="rounded-seed bg-persimmon-500 text-longan-950 hover:bg-persimmon-400 focus-visible:outline-persimmon-400 flex cursor-pointer p-[5px] transition-colors duration-300 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span
                aria-hidden="true"
                className="iconify lucide--lock-open h-3 w-3"
              />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={rememberId}
          type="checkbox"
          checked={rememberKeys}
          onChange={(e) => setRememberKeys(e.target.checked)}
          className="accent-persimmon-500"
        />
        <label htmlFor={rememberId} className="text-rambutan-400 text-xs">
          Remember keys on this device
        </label>
      </div>
    </div>
  );
}
