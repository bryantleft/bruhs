import { memo } from "react";
import { MessageError } from "@/components/messages/message-error";
import { useSelectedMessage } from "@/components/messages/use-selected-message";
import { useInitialStore } from "@/lib/stores";
import { cn } from "@/lib/utils";

type UserMessageProps = {
  content: string;
  error?: string;
  selected?: boolean;
};

function UserMessage({ content, error, selected = false }: UserMessageProps) {
  const visible = useInitialStore((s) => s.visible);
  const ref = useSelectedMessage(selected);

  return (
    <div ref={ref} className="flex flex-col gap-y-1">
      <div
        className={cn(
          "rounded-lychee border-longan-800 bg-longan-900 hover:border-longan-700 border-[0.5px] p-3",
          "transition-all duration-300 ease-in-out",
          visible ? "opacity-100" : "opacity-0",
          error && "border-lychee-600 hover:border-lychee-500",
          selected &&
            "border-blueberry-400 ring-blueberry-400 hover:border-blueberry-400 ring-2",
        )}
      >
        <span className="text-rambutan-200 text-sm whitespace-pre-line">
          {content}
        </span>
      </div>
      {error && <MessageError error={error} />}
    </div>
  );
}

export default memo(UserMessage);
