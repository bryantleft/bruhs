import { memo, useEffect, useRef } from "react";
import { useBruhStore, useInitialStore } from "@/lib/stores";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type UserMessageProps = {
  message: Message;
  selected?: boolean;
};

function UserMessage({ message, selected = false }: UserMessageProps) {
  const { visible } = useInitialStore();
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
          "rounded-xl border-[0.5px] border-longan-800 bg-longan-900 p-3 hover:border-longan-700",
          "transition-all duration-300 ease-in-out",
          visible ? "opacity-100" : "opacity-0",
          message.error && "border-lychee hover:border-lychee-500",
          selected &&
            "border-mangosteen ring-2 ring-mangosteen hover:border-mangosteen",
        )}
      >
        <span className="whitespace-pre-line text-rambutan-200 text-sm">
          {message.content}
        </span>
      </div>
      {message.error && (
        <div className="flex h-4 items-center justify-start">
          <div className="flex items-center justify-center gap-x-1">
            <span className="iconify lucide--circle-alert h-4 w-4 text-lychee" />
            <span className="text-lychee text-xs">{message.error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(UserMessage);
