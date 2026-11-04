import { marked, type Token } from "marked";
import { memo, useMemo, useState } from "react";
import { TokenBlock } from "@/components/messages/blocks";
import { MessageError } from "@/components/messages/message-error";
import { useSelectedMessage } from "@/components/messages/use-selected-message";
import { cn, copyToClipboard } from "@/lib/utils";

// marked 18 emits a `space` token after these blocks, where marked 15 kept the
// trailing blank lines inside the block; drop it to keep the previous spacing.
function keepsTrailingSpace(token: Token | undefined): boolean {
  return (
    token?.type === "heading" ||
    token?.type === "html" ||
    token?.type === "table" ||
    (token?.type === "code" && token.codeBlockStyle === "indented")
  );
}

function lex(content: string): Token[] {
  return marked
    .lexer(content)
    .filter(
      (token, i, all) =>
        !(token.type === "space" && keepsTrailingSpace(all[i - 1])),
    );
}

type BruhMessageProps = {
  content: string;
  error?: string;
  selected?: boolean;
};

function BruhMessage({ content, error, selected = false }: BruhMessageProps) {
  const [isCopied, setIsCopied] = useState(false);
  const ref = useSelectedMessage(selected);
  const tokens = useMemo(() => lex(content), [content]);

  async function copyContent(): Promise<void> {
    setIsCopied(await copyToClipboard(content));
    setTimeout(() => setIsCopied(false), 3000);
  }

  return (
    <div ref={ref} className="flex flex-col gap-y-1">
      <div
        className={cn(
          "group rounded-lychee relative flex flex-col gap-y-2",
          "bg-longan-900 border-[0.5px] p-3",
          "transition-all duration-300 ease-in-out",
          "border-longan-800 hover:border-longan-700",
          error && "border-lychee-600 hover:border-lychee-500",
          selected &&
            "border-blueberry-400 ring-blueberry-400 hover:border-blueberry-400 ring-2",
        )}
      >
        <img
          src="/bruhs/right.svg"
          alt=""
          className="absolute -top-2 -left-2"
          width={20}
          height={20}
        />
        {tokens.map((token, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
          <TokenBlock key={`${i}-${token.type}`} token={token} />
        ))}
        <div
          className={cn(
            "rounded-grape absolute -right-3 -bottom-3 p-[3px]",
            "border-rambutan-600 bg-longan-700 border-[0.5px]",
            "opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100 has-focus-visible:opacity-100",
          )}
        >
          <button
            type="button"
            onClick={copyContent}
            aria-label={isCopied ? "Copied" : "Copy message"}
            className={cn(
              "rounded-seed flex cursor-pointer items-center justify-center",
              "group/copy hover:bg-longan-800 px-1 py-[2px]",
              "focus-visible:outline-persimmon-400 focus-visible:outline-2",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "iconify h-3 w-3",
                isCopied
                  ? "lucide--check text-pandan-400"
                  : "lucide--copy text-rambutan-400",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "text-xs whitespace-nowrap",
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
      {error && <MessageError error={error} />}
    </div>
  );
}

export default memo(BruhMessage);
