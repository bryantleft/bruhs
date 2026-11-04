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
          "surface-panel text-body-sm p-3 hover:[--surface-ring:10%]",
          "duration-standard transition-[opacity,box-shadow]",
          visible ? "opacity-100" : "opacity-0",
          error &&
            "inset-ring-lychee-600 hover:inset-ring-lychee-500 inset-ring",
          selected &&
            "inset-ring-blueberry-400 ring-blueberry-400 hover:inset-ring-blueberry-400 ring-2 inset-ring",
        )}
      >
        <span className="text-rambutan-200 whitespace-pre-line">{content}</span>
      </div>
      {error && <MessageError error={error} />}
    </div>
  );
}

export default memo(UserMessage);
