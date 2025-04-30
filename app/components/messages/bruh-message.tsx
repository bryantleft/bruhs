import { TokenBlock } from "@/components/messages/blocks";
import { useBruhStore } from "@/lib/stores";
import type { Message } from "@/lib/types";
import { cn, copyToClipboard, randomKey } from "@/lib/utils";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";

type BruhMessageProps = {
  message: Message;
  selected?: boolean;
};

export default function BruhMessage({
  message,
  selected = false,
}: BruhMessageProps) {
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
          "border-[0.5px] bg-platinum-900 p-3",
          "transition-all duration-300 ease-in-out",
          "border-platinum-800 hover:border-platinum-700",
          message.error && "border-ruby hover:border-ruby-500",
          selected &&
            "border-amethyst ring-2 ring-amethyst hover:border-amethyst",
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
            "border-[0.5px] border-platinum-600 bg-platinum-700",
            "opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100",
          )}
        >
          <button
            type="button"
            onMouseDown={copyContent}
            className={cn(
              "flex cursor-pointer items-center justify-center rounded",
              "group/copy px-1 py-[2px] hover:bg-platinum-800",
            )}
          >
            <span
              className={cn(
                "iconify h-3 w-3",
                isCopied
                  ? "lucide--check text-emerald-400"
                  : "lucide--copy text-platinum-400",
              )}
            />
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                "max-w-0 group-hover/copy:max-w-[100px] group-hover/copy:pl-1",
                "overflow-hidden transition-all duration-300 ease-in-out",
                isCopied ? "text-emerald-400" : "text-platinum-400",
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
            <span className="iconify lucide--circle-alert h-4 w-4 text-ruby" />
            <span className="text-ruby text-xs">{message.error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
