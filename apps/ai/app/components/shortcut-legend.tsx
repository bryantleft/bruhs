import { type ReactNode, useId } from "react";
import { useDisclosure } from "@/lib/hooks/use-disclosure";
import { cn, useMetaKey } from "@/lib/utils";

const KeyButton = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-seed border-rambutan-600 bg-longan-700 text-rambutan-200 border px-2 py-1 text-xs font-semibold">
    {children}
  </kbd>
);

export default function ShortcutLegend() {
  const { isOpen, setIsOpen, ref } = useDisclosure();
  const panelId = useId();
  const metaKey = useMetaKey();

  const shortcuts = [
    // Core actions
    { keys: [metaKey, "k"], description: "Open command bar" },
    { keys: ["/"], description: "Input" },

    // Navigation
    { keys: ["j"], description: "Next message" },
    { keys: ["k"], description: "Previous message" },

    // Message actions
    { keys: [metaKey, "c"], description: "Copy message" },
    { keys: ["d"], description: "Delete message" },

    // General
    { keys: ["esc"], description: "Clear selection" },
  ];

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
          : "w-[34px] hover:w-[120px] has-focus-visible:w-[120px]",
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label="Keyboard shortcuts"
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
            Shortcuts
          </span>
          <span
            aria-hidden="true"
            className="iconify lucide--keyboard text-rambutan-200 h-4 w-4"
          />
        </button>
      </div>

      <div
        id={panelId}
        inert={!isOpen}
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
