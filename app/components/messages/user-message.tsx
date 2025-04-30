import { useInitialLoad } from "@/lib/hooks";
import { useBruhStore } from "@/lib/stores";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type UserMessageProps = {
  message: Message;
  selected?: boolean;
};

export default function UserMessage({
  message,
  selected = false,
}: UserMessageProps) {
  const { isVisible } = useInitialLoad();
  const { setFocusPosition } = useBruhStore();
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && messageRef.current) {
      messageRef.current.focus();
      messageRef.current.scrollIntoView({
        behavior: "instant",
        block: "center",
      });

      const rect = messageRef.current.getBoundingClientRect();
      setFocusPosition({ x: rect.left, y: rect.top });
    }
  }, [selected, setFocusPosition]);

  return (
    <div className="flex flex-col gap-y-1">
      <div ref={messageRef} />
      <div
        className={cn(
          "rounded-xl border-[0.5px] border-onyx-800 bg-onyx p-3 hover:border-onyx-700",
          "transition-all duration-300 ease-in-out",
          isVisible ? "opacity-100" : "opacity-0",
          message.error && "border-ruby hover:border-ruby-500",
          selected &&
            "border-amethyst ring-2 ring-amethyst hover:border-amethyst",
        )}
      >
        <span className="whitespace-pre-line text-onyx-200 text-sm">
          {message.content}
        </span>
      </div>
      {message.error && (
        <div className="flex h-4 items-center justify-start">
          <div className="flex items-center justify-center gap-x-1">
            <span className="iconify lucide--circle-alert h-4 w-4 text-ruby" />
            <span className="text-ruby text-xs">{message.error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
