import { type ChangeEvent, useEffect, useState } from "react";
import { models, ProviderInfo } from "@/lib/data";
import { useDisclosure } from "@/lib/hooks/use-disclosure";
import { useLLMStore } from "@/lib/stores";
import { InputType, type Model, OutputType, Provider } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { keys, model, addKey, removeKey, setModel } = useLLMStore();
  const { isOpen, setIsOpen, ref } = useDisclosure();

  const initialKey = keys ? (keys[model.provider] ?? "") : "";
  const [apiKey, setApiKey] = useState(initialKey);

  useEffect(() => {
    const key = keys ? (keys[model.provider] ?? "") : "";
    setApiKey(key);
  }, [keys, model]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

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

  const handleModelSelect = (newModel: Model) => {
    setModel(newModel);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "group",
        "rounded-lg bg-longan-800 p-2 shadow-lg",
        "border border-longan-700 text-rambutan-200 hover:border-rambutan-600",
        "transition-all duration-300 ease-in-out",
        isOpen ? "w-56" : "w-[34px] hover:w-[110px]",
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          onMouseDown={toggleOpen}
          className="flex w-full cursor-pointer items-center justify-between"
        >
          <h3
            className={cn(
              "overflow-hidden whitespace-nowrap font-semibold text-sm transition-all duration-300 ease-in-out",
              isOpen
                ? "max-w-full opacity-100"
                : "max-w-0 opacity-0 group-hover:max-w-full group-hover:opacity-100",
            )}
          >
            Settings
          </h3>
          <span className="iconify lucide--settings h-4 w-4 text-rambutan-200" />
        </button>
      </div>

      <div
        id="settings-content"
        className={cn(
          "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="mb-4">
          <h4 className="mb-2 font-medium text-rambutan-400 text-xs">
            Model Provider
          </h4>
          <div className="space-y-1">
            {models.map((currentModel) => (
              <button
                key={currentModel.id}
                type="button"
                onClick={() => handleModelSelect(currentModel)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors duration-200",
                  model.id === currentModel.id
                    ? "cursor-default bg-mangosteen-700 font-semibold text-white"
                    : "cursor-pointer text-rambutan-400 hover:bg-longan-700 hover:text-rambutan-200",
                )}
                disabled={model.id === currentModel.id}
              >
                <img
                  src={ProviderInfo[currentModel.provider].logo}
                  alt={`${currentModel.provider} logo`}
                  width={20}
                  height={20}
                  className="select-none rounded"
                />
                {currentModel.name}
                <span className="ml-auto flex items-center gap-1">
                  {currentModel.inputs.includes(InputType.TEXT) && (
                    <span className="inline-flex items-center justify-center rounded border border-longan-700 bg-longan-900 p-0.5">
                      <span className="iconify lucide--type h-3 w-3 text-rambutan-400" />
                    </span>
                  )}
                  <span className="iconify lucide--arrow-right h-3 w-3 text-rambutan-500" />
                  {currentModel.outputs.includes(OutputType.TEXT) && (
                    <span className="inline-flex items-center justify-center rounded border border-longan-700 bg-longan-900 p-0.5">
                      <span className="iconify lucide--type h-3 w-3 text-rambutan-400" />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-medium text-rambutan-400 text-xs">
            API Key ({model.provider})
          </h4>
          <div
            className={cn(
              "relative w-full overflow-hidden rounded",
              "border-[0.5px] border-longan-900 transition-colors duration-300",
              initialKey
                ? "cursor-not-allowed"
                : "cursor-text hover:border-longan-700",
            )}
          >
            <input
              type="password"
              value={apiKey}
              onChange={handleKeyChange}
              placeholder={
                model.provider === Provider.XAI ? "xai-..." : "sk-..."
              }
              className={cn(
                "h-full w-full rounded py-2 pr-8 pl-3",
                "bg-longan-950 text-rambutan-400 text-xs placeholder:text-rambutan-400",
                "transition-opacity duration-300 focus:outline-none",
                initialKey
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-text opacity-100",
              )}
              disabled={!!initialKey}
              autoComplete="off"
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
                onClick={handleAddKey}
                className={cn(
                  "flex rounded-lg p-[5px] transition-colors duration-300",
                  canAddKey()
                    ? "cursor-pointer bg-mangosteen-700 hover:bg-mangosteen-600"
                    : "cursor-not-allowed",
                  initialKey && "bg-mangosteen",
                )}
                disabled={!canAddKey() || !!initialKey}
              >
                <span className="iconify lucide--lock-open h-3 w-3 text-rambutan-300" />
              </button>
            </div>
            <div
              className={cn(
                "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-10 transform",
                "transition-all duration-300",
                initialKey ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <div className="flex cursor-not-allowed rounded-lg bg-mangosteen-700 p-[5px]">
                <span className="iconify lucide--lock h-3 w-3 text-rambutan-300" />
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
                onClick={handleRemoveKey}
                className="flex cursor-pointer rounded-lg p-[5px] *:hover:text-lychee-700 focus:outline-none"
              >
                <span className="iconify lucide--trash h-3 w-3 text-rambutan-400 transition-colors duration-300" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
