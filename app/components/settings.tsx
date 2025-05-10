import { ProviderInfo, models } from "@/lib/data";
import { useLLMStore, useMessageStore } from "@/lib/stores";
import { type Model, Provider } from "@/lib/types";
import { cn } from "@/lib/utils";
import React, { type ChangeEvent, useEffect, useRef, useState } from "react";

export default function Settings() {
  const { clearMessageHistory } = useMessageStore();
  const { keys, model, addKey, removeKey, setModel } = useLLMStore();
  const [isOpen, setIsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const initialKey = keys ? keys[model.provider] ?? "" : "";
  const [apiKey, setApiKey] = useState(initialKey);

  useEffect(() => {
    const key = keys ? keys[model.provider] ?? "" : "";
    setApiKey(key);
  }, [keys, model]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

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
      ref={settingsRef}
      className={cn(
        "group",
        "rounded-lg bg-onyx-800 p-2 shadow-lg",
        "border border-onyx-700 text-onyx-200",
        "transition-all duration-300 ease-in-out",
        isOpen ? "border-onyx-600" : "hover:border-onyx-600",
        isOpen ? "w-56" : "w-[34px] hover:w-[110px]",
        isOpen && "hover:w-56"
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          className="flex w-full items-center justify-between"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls="settings-content"
        >
          <h3
            className={cn(
              "overflow-hidden whitespace-nowrap font-semibold text-sm transition-all duration-300 ease-in-out",
              isOpen
                ? "max-w-full opacity-100"
                : "max-w-0 opacity-0 group-hover:max-w-full group-hover:opacity-100"
            )}
          >
            Settings
          </h3>
          <span className="iconify lucide--settings h-4 w-4 text-onyx-200" />
        </button>
      </div>

      <div
        id="settings-content"
        className={cn(
          "space-y-4 overflow-hidden transition-all duration-300 ease-in-out", // Added overflow-hidden
          isOpen ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="mb-4">
          <h4 className="mb-2 font-medium text-platinum-400 text-xs">
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
                    ? "cursor-default bg-amethyst-700 font-semibold text-white"
                    : "cursor-pointer text-platinum-400 hover:bg-onyx-700 hover:text-platinum-200"
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
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="mb-2 font-medium text-platinum-400 text-xs">
            API Key ({model.provider})
          </h4>
          <div
            className={cn(
              "relative w-full overflow-hidden rounded",
              "border-[0.5px] border-platinum-900 transition-colors duration-300",
              initialKey
                ? "cursor-not-allowed"
                : "cursor-text hover:border-platinum-700"
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
                "bg-platinum-950 text-platinum-400 text-xs placeholder:text-platinum-400",
                "transition-opacity duration-300 focus:outline-none",
                initialKey
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-text opacity-100"
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
                  : "pointer-events-none right-[calc(50%-12px)] opacity-0"
              )}
            >
              <button
                type="button"
                onClick={handleAddKey}
                className={cn(
                  "flex rounded-lg p-[5px] transition-colors duration-300",
                  canAddKey()
                    ? "cursor-pointer bg-amethyst-700 hover:bg-amethyst-600"
                    : "cursor-not-allowed",
                  initialKey && "bg-amethyst"
                )}
                disabled={!canAddKey() || !!initialKey}
                aria-label="Save API Key"
              >
                <span className="iconify lucide--lock-open h-3 w-3 text-onyx-300" />
              </button>
            </div>
            <div
              className={cn(
                "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-10 transform",
                "transition-all duration-300",
                initialKey ? "opacity-100" : "pointer-events-none opacity-0"
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
                initialKey ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              <button
                type="button"
                onClick={handleRemoveKey}
                className="flex cursor-pointer rounded-lg p-[5px] *:hover:text-ruby-700 focus:outline-none"
                aria-label="Remove API Key"
              >
                <span className="iconify lucide--trash h-3 w-3 text-platinum-400 transition-colors duration-300" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-onyx-700 border-t pt-2">
          <button
            type="button"
            className="group/clear flex w-full items-center justify-start text-sm"
            onClick={() => clearMessageHistory()}
          >
            <span className="cursor-pointer text-platinum-400 text-xs transition-colors duration-300 group-hover/clear:text-ruby-700">
              Clear history
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
