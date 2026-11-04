import { type ReactNode, useId } from "react";
import { useDisclosure } from "@/lib/hooks/use-disclosure";
import { cn, useMetaKey } from "@/lib/utils";

const KeyButton = ({ children }: { children: ReactNode }) => (
  <kbd className="kbd">{children}</kbd>
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
        "surface-card surface-interactive rounded-grape text-rambutan-200 p-2",
        "duration-standard transition-[width,box-shadow]",
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
          "duration-standard ease-standard space-y-2 overflow-hidden transition-[max-height,margin,opacity]",
          isOpen ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.description}
            className="text-label-sm flex items-center justify-between gap-x-8"
          >
            <span className="text-rambutan-400">{shortcut.description}</span>
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
