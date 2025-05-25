import { useDisclosure, useIsMac } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function ShortcutLegend() {
  const isMac = useIsMac();
  const { isOpen, setIsOpen, ref } = useDisclosure();

  const shortcuts = [
    { keys: ["/"], description: "Input" },
    { keys: ["j"], description: "Next message" },
    { keys: ["k"], description: "Previous message" },
    { keys: isMac ? ["⌘", "c"] : ["ctrl", "c"], description: "Copy message" },
    { keys: ["d"], description: "Delete message" },
    { keys: ["esc"], description: "Clear selection" },
  ];

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const KeyButton = ({ children }: { children: ReactNode }) => (
    <kbd className="rounded border border-onyx-600 bg-onyx-700 px-2 py-1 font-semibold text-onyx-200 text-xs shadow">
      {children}
    </kbd>
  );

  return (
    <div
      ref={ref}
      className={cn(
        "group",
        "rounded-lg bg-onyx-800 p-2 shadow-lg",
        "border border-onyx-700 text-onyx-200 hover:border-onyx-600",
        "transition-all duration-300 ease-in-out",
        isOpen ? "w-56" : "w-[34px] hover:w-[120px]",
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
            Shortcuts
          </h3>
          <span className="iconify lucide--keyboard h-4 w-4 text-onyx-200" />
        </button>
      </div>

      <div
        className={cn(
          "space-y-2 overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.description}
            className="flex items-center justify-between gap-x-8 text-sm"
          >
            <span className="text-onyx-400 text-xs">
              {shortcut.description}
            </span>
            <div className="flex gap-1">
              {shortcut.keys.map((key) => (
                <KeyButton key={key}>{key}</KeyButton>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
