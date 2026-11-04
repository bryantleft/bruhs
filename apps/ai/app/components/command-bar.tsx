import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { ModelOption } from "@/components/model-option";
import { models } from "@/lib/data";
import { useCommandStore, useLLMStore, useModel } from "@/lib/stores";
import { cn } from "@/lib/utils";

export default function CommandBar() {
  const isOpen = useCommandStore((s) => s.commandBarOpen);
  const setCommandBarOpen = useCommandStore((s) => s.setCommandBarOpen);
  const model = useModel();
  const setModel = useLLMStore((s) => s.setModel);
  const [search, setSearch] = useState("");

  // Open state lives in the store (the bruh reads it); clear the search on every change.
  const setOpen = (open: boolean): void => {
    setCommandBarOpen(open);
    setSearch("");
  };

  // A window listener with cleanup: the remaining legitimate use of an effect.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandBarOpen(!useCommandStore.getState().commandBarOpen);
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandBarOpen]);

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={setOpen}
      label="Switch model"
      className={cn(
        "absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        "rounded-lychee bg-longan-700 text-rambutan-200 w-full max-w-md p-2 inset-ring inset-ring-white/15",
      )}
    >
      <Command.Input
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder="Switch model..."
        className="border-longan-600 text-rambutan-200 placeholder:text-rambutan-400 mb-2 w-full border-b bg-transparent p-2 text-sm focus:outline-none"
      />
      <Command.List className="max-h-72 overflow-y-auto">
        <Command.Empty className="text-rambutan-400 px-2 text-sm">
          No results found.
        </Command.Empty>
        <Command.Group
          heading={
            <span className="text-rambutan-400 px-2 text-xs font-medium">
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
                "rounded-seed flex cursor-pointer items-center gap-2 px-2 py-2 text-xs transition-colors duration-200",
                "data-[selected=true]:bg-longan-600",
                model.id === m.id
                  ? "bg-blueberry-500/20 text-blueberry-100 cursor-default font-semibold"
                  : "text-rambutan-400 hover:bg-longan-600 hover:text-rambutan-200",
              )}
              disabled={model.id === m.id}
            >
              <ModelOption model={m} />
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
