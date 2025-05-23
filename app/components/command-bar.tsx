import { ProviderInfo, models } from "@/lib/data";
import { useLLMStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";

export function CommandBarButton({ onClick }: { onClick: () => void }) {
  return (
    <div
      onMouseDown={onClick}
      className={cn(
        "group",
        "rounded-lg bg-onyx-800 p-2 shadow-lg",
        "border border-onyx-700 text-onyx-200 hover:border-onyx-600",
        "cursor-pointer transition-all duration-300 ease-in-out",
        "w-[34px] hover:w-[120px]",
      )}
      style={{ minWidth: 0 }}
    >
      <div className="flex items-center">
        <div className="flex w-full items-center justify-between">
          <h3
            className={cn(
              "overflow-hidden whitespace-nowrap font-semibold text-sm transition-all duration-300 ease-in-out",
              "max-w-0 opacity-0 group-hover:max-w-full group-hover:opacity-100",
            )}
          >
            Commands
          </h3>
          <span className="iconify lucide--command h-4 w-4 text-onyx-200" />
        </div>
      </div>
    </div>
  );
}

export function CommandBar({
  open,
  setOpen,
}: { open: boolean; setOpen: (open: boolean) => void }) {
  const { model, setModel } = useLLMStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setSearch("");
    }
  }, [open]);

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Bar"
      className={cn(
        "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 z-50",
        "w-full max-w-md rounded-lg border border-onyx-700 bg-onyx-800 p-2 text-onyx-200 shadow-lg",
      )}
    >
      <Command.Input
        ref={inputRef}
        value={search}
        onValueChange={setSearch}
        placeholder="Switch model..."
        className={cn(
          "mb-2 w-full border-onyx-700 border-b p-2 text-onyx-200 text-sm focus:outline-none",
        )}
      />
      <Command.List className="max-h-72 overflow-y-auto">
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group
          heading={
            <span className="px-2 font-medium text-onyx-400 text-xs">
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
                setOpen(false);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs transition-colors duration-200",
                model.id === m.id
                  ? "cursor-default bg-amethyst-700 font-semibold text-white"
                  : "text-platinum-400 hover:bg-onyx-700 hover:text-platinum-200",
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
              {m.name}
              <span className="ml-auto text-onyx-400 text-xs">
                {model.id === m.id ? "Current" : null}
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
