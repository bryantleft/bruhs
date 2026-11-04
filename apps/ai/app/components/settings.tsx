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
        "surface-card surface-interactive rounded-grape text-rambutan-200 p-2",
        "duration-standard transition-[width,box-shadow]",
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
          className="rounded-seed flex w-full cursor-pointer items-center justify-between"
        >
          <span
            aria-hidden="true"
            className={cn(
              "text-label duration-standard ease-standard overflow-hidden whitespace-nowrap transition-[max-width,opacity]",
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
          "duration-standard ease-standard space-y-4 overflow-hidden transition-[max-height,margin,opacity]",
          isOpen ? "mt-3 max-h-[32rem] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <fieldset className="mb-4">
          <legend className="text-label-sm text-rambutan-400 mb-2">
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
                  "menu-item text-code-sm px-2 py-1",
                  model.id === m.id && "cursor-default font-semibold",
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
        className="text-label-sm text-rambutan-400 mb-2 block"
      >
        API key ({model.provider})
      </label>
      <div className="relative w-full">
        <input
          id={inputId}
          type="password"
          value={isSaved ? savedKey : apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={model.provider === Provider.XAI ? "xai-..." : "sk-..."}
          className="input text-code-sm pr-8"
          disabled={isSaved}
          autoComplete="off"
        />
        <div className="z-raised absolute inset-y-0 right-0 flex items-center pr-2">
          {isSaved ? (
            <button
              type="button"
              onClick={() => {
                removeKey(model.provider);
                setApiKey("");
              }}
              aria-label={`Remove the ${model.provider} API key`}
              className="btn btn-ghost btn-icon rounded-seed text-rambutan-400 hover:text-lychee-400 p-[5px]"
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
              className="btn btn-primary btn-icon rounded-seed p-[5px]"
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
        <label htmlFor={rememberId} className="text-label-sm text-rambutan-400">
          Remember keys on this device
        </label>
      </div>
    </div>
  );
}
