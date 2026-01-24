import { marked } from "marked";
import { memo, useEffect, useRef, useState } from "react";
import { TokenBlock } from "@/components/messages/blocks";
import { useBruhStore } from "@/lib/stores";
import type { Message } from "@/lib/types";
import { cn, copyToClipboard, randomKey } from "@/lib/utils";

type BruhMessageProps = {
  message: Message;
  selected?: boolean;
};

function BruhMessage({ message, selected = false }: BruhMessageProps) {
  const { setFocusPosition } = useBruhStore();
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const tokens = marked.lexer(message.content);

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

  async function copyContent() {
    setIsCopied(await copyToClipboard(message.content));
    setTimeout(() => setIsCopied(false), 3000);
  }

  return (
    <div className="flex flex-col gap-y-1">
      <div ref={messageRef} />
      <div
        className={cn(
          "group relative flex flex-col gap-y-2 rounded-xl",
          "border-[0.5px] bg-longan-900 p-3",
          "transition-all duration-300 ease-in-out",
          "border-longan-800 hover:border-longan-700",
          message.error && "border-lychee hover:border-lychee-500",
          selected &&
            "border-mangosteen ring-2 ring-mangosteen hover:border-mangosteen",
        )}
      >
        <img
          src="/bruhs/right.svg"
          alt="bruh"
          className="-top-2 -left-2 absolute"
          width={20}
          height={20}
        />
        {tokens.map((token) => {
          return <TokenBlock key={randomKey()} token={token} />;
        })}
        <div
          className={cn(
            "-bottom-3 -right-3 absolute rounded-lg p-[3px]",
            "border-[0.5px] border-rambutan-600 bg-longan-700",
            "opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100",
          )}
        >
          <button
            type="button"
            onMouseDown={copyContent}
            className={cn(
              "flex cursor-pointer items-center justify-center rounded",
              "group/copy px-1 py-[2px] hover:bg-longan-800",
            )}
          >
            <span
              className={cn(
                "iconify h-3 w-3",
                isCopied
                  ? "lucide--check text-pandan-400"
                  : "lucide--copy text-rambutan-400",
              )}
            />
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                "max-w-0 group-hover/copy:max-w-[100px] group-hover/copy:pl-1",
                "overflow-hidden transition-all duration-300 ease-in-out",
                isCopied ? "text-pandan-400" : "text-rambutan-400",
              )}
            >
              {isCopied ? "Copied" : "Copy"}
            </span>
          </button>
        </div>
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

export default memo(BruhMessage);
