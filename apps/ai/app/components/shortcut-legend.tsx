import type { ReactNode } from "react";
import { useDisclosure } from "@/lib/hooks/use-disclosure";
import { cn, getMetaKey } from "@/lib/utils";

export default function ShortcutLegend() {
  const { isOpen, setIsOpen, ref } = useDisclosure();

  const shortcuts = [
    // Core actions
    { keys: [getMetaKey(), "k"], description: "Open command bar" },
    { keys: ["/"], description: "Input" },

    // Navigation
    { keys: ["j"], description: "Next message" },
    { keys: ["k"], description: "Previous message" },

    // Message actions
    { keys: [getMetaKey(), "c"], description: "Copy message" },
    { keys: ["d"], description: "Delete message" },

    // General
    { keys: ["esc"], description: "Clear selection" },
  ];

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const KeyButton = ({ children }: { children: ReactNode }) => (
    <kbd className="rounded border border-rambutan-600 bg-longan-700 px-2 py-1 font-semibold text-rambutan-200 text-xs shadow">
      {children}
    </kbd>
  );

  return (
    <div
      ref={ref}
      className={cn(
        "group",
        "rounded-lg bg-longan-800 p-2 shadow-lg",
        "border border-longan-700 text-rambutan-200 hover:border-rambutan-600",
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
          <span className="iconify lucide--keyboard h-4 w-4 text-rambutan-200" />
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
            <span className="text-rambutan-400 text-xs">
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
