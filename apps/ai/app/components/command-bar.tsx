import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import { models, ProviderInfo } from "@/lib/data";
import { useCommandStore, useLLMStore } from "@/lib/stores";
import { InputType, OutputType } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function CommandBar() {
  const setCommandBarOpen = useCommandStore((s) => s.setCommandBarOpen);
  const { model, setModel } = useLLMStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCommandBarOpen(isOpen);
  }, [isOpen, setCommandBarOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setSearch("");
    }
  }, [isOpen]);

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      label="Command Bar"
      className={cn(
        "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-50",
        "w-full max-w-md rounded-lg border border-longan-700 bg-longan-800 p-2 text-rambutan-200 shadow-lg",
      )}
    >
      <Command.Input
        ref={inputRef}
        value={search}
        onValueChange={setSearch}
        placeholder="Switch model..."
        className={cn(
          "mb-2 w-full border-longan-700 border-b p-2 text-rambutan-200 text-sm focus:outline-none",
        )}
      />
      <Command.List className="max-h-72 overflow-y-auto">
        <Command.Empty className="px-2 text-rambutan-400 text-sm">
          No results found.
        </Command.Empty>
        <Command.Group
          heading={
            <span className="px-2 font-medium text-rambutan-400 text-xs">
              Models
            </span>
          }
        >
          {filteredModels.map((m) => (
            <Command.Item
              key={m.id}
              value={m.name}
              onSelect={() => {
                setModel(m);
                setIsOpen(false);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs transition-colors duration-200",
                model.id === m.id
                  ? "cursor-default bg-mangosteen-700 font-semibold text-white"
                  : "text-rambutan-400 hover:bg-longan-700 hover:text-rambutan-200",
              )}
              disabled={model.id === m.id}
            >
              <img
                src={ProviderInfo[m.provider].logo}
                alt={`${m.provider} logo`}
                width={20}
                height={20}
                className="select-none rounded"
              />
              <span className="flex items-center gap-1">{m.name}</span>
              <span className="ml-auto flex items-center gap-1">
                {m.inputs.includes(InputType.TEXT) && (
                  <span className="inline-flex items-center justify-center rounded border border-longan-700 bg-longan-900 p-0.5">
                    <span className="iconify lucide--type h-3 w-3 text-rambutan-400" />
                  </span>
                )}
                <span className="iconify lucide--arrow-right h-3 w-3 text-rambutan-500" />
                {m.outputs.includes(OutputType.TEXT) && (
                  <span className="inline-flex items-center justify-center rounded border border-longan-700 bg-longan-900 p-0.5">
                    <span className="iconify lucide--type h-3 w-3 text-rambutan-400" />
                  </span>
                )}
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
