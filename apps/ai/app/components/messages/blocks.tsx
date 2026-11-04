import type { Token, Tokens } from "marked";
import { useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import haskell from "react-syntax-highlighter/dist/esm/languages/prism/haskell";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import { langIcon } from "@/lib/data";
import { cn, copyToClipboard } from "@/lib/utils";

// Only the languages that have an icon in `langIcon`; anything else renders unhighlighted.
const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  go,
  haskell,
  java,
  javascript,
  jsx,
  kotlin,
  python,
  ruby,
  rust,
  sql,
  swift,
  tsx,
  typescript,
};
for (const [name, language] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, language);
}

/** Render a list of tokens. Tokens only ever append while streaming, so index keys are stable. */
function TokenList({ tokens, text }: { tokens?: Token[]; text?: string }) {
  if (!tokens) return text ?? null;
  return tokens.map((token, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
    <TokenBlock key={`${i}-${token.type}`} token={token} />
  ));
}

export function TokenBlock({ token }: { token: Token }) {
  switch (token.type) {
    case "text":
    case "strong": {
      const { tokens, text } = token;
      const Tag = token.type === "strong" ? "strong" : "span";
      return tokens ? (
        <Tag>
          <TokenList tokens={tokens} />
        </Tag>
      ) : (
        <Tag className="text-rambutan-300 text-sm">{text}</Tag>
      );
    }
    case "paragraph":
      return (
        <p className="text-rambutan-300 text-sm">
          <TokenList tokens={token.tokens} text={token.text} />
        </p>
      );
    case "code": {
      const { lang, text } = token;
      return <CodeBlock lang={lang || undefined} text={text} />;
    }
    case "list": {
      const { items, ordered, start } = token;
      return <ListBlock items={items} ordered={ordered} start={start} />;
    }
    case "codespan":
      return <CodeSpanBlock text={token.text} />;
    case "heading":
      return <HeadingBlock text={token.text} />;
    default:
      return <span className="text-rambutan-300 text-sm">{token.raw}</span>;
  }
}

function CodeBlock({ lang, text }: { lang: string | undefined; text: string }) {
  const [isChecked, setIsChecked] = useState(false);
  const highlightedLang = lang ?? "text";

  async function copyText(): Promise<void> {
    setIsChecked(await copyToClipboard(text));
    setTimeout(() => setIsChecked(false), 3000);
  }

  return (
    <div className="rounded-grape border-longan-800 bg-longan-900 my-3 overflow-hidden border-[0.5px]">
      <div className="border-longan-800 flex justify-between border-b-[0.5px] px-2 py-2">
        <div className="flex gap-x-1">
          {lang && (
            <span
              aria-hidden="true"
              className={`${langIcon(highlightedLang)} text-mangosteen-400 h-4 w-4`}
            />
          )}
          <span className="text-rambutan-500 text-xs">{highlightedLang}</span>
        </div>
        <button
          type="button"
          onClick={copyText}
          aria-label={isChecked ? "Copied" : "Copy code"}
          className="rounded-seed focus-visible:outline-persimmon-400 flex cursor-pointer items-center justify-center focus-visible:outline-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              "iconify h-4 w-4",
              isChecked
                ? "lucide--check text-pandan-400"
                : "lucide--copy text-rambutan-400",
            )}
          />
        </button>
      </div>
      <pre className="*:!m-0">
        <SyntaxHighlighter language={highlightedLang} style={vscDarkPlus}>
          {text}
        </SyntaxHighlighter>
      </pre>
    </div>
  );
}

function CodeSpanBlock({ text }: { text: string }) {
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => copyToClipboard(text)}
      className="rounded-seed bg-longan-950 text-mangosteen-400 focus-visible:outline-persimmon-400 cursor-pointer px-1 py-[0.5px] focus-visible:outline-2"
    >
      <code>{text}</code>
    </button>
  );
}

function ListItemBlock({
  tokens,
  number,
}: {
  tokens: Token[];
  number?: number;
}) {
  return (
    <li>
      {number !== undefined && (
        <span className="text-mangosteen-400 pr-1 text-sm">{number}.</span>
      )}
      {tokens.map((token, i) =>
        // marked 17+ emits `paragraph` tokens in loose list items where marked
        // 15 emitted inline `text` tokens; render them inline as before.
        token.type === "paragraph" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
          <span key={`${i}-${token.type}`}>
            <TokenList tokens={token.tokens} text={token.text} />
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
          <TokenBlock key={`${i}-${token.type}`} token={token} />
        ),
      )}
    </li>
  );
}

function ListBlock({
  items,
  ordered,
  start,
}: {
  items: Tokens.ListItem[];
  ordered: boolean;
  start: number | "";
}) {
  if (ordered) {
    const first = start === "" ? 1 : start;
    return (
      <ol>
        {items.map((item, position) => (
          <ListItemBlock
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
            key={`${position}-${item.type}`}
            tokens={item.tokens}
            number={first + position}
          />
        ))}
      </ol>
    );
  }

  return (
    <ul className="text-mangosteen-400 list-disc pl-3 text-sm">
      {items.map((item, position) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
        <ListItemBlock key={`${position}-${item.type}`} tokens={item.tokens} />
      ))}
    </ul>
  );
}

function HeadingBlock({ text }: { text: string }) {
  return (
    <h3 className="rounded-t-grape border-longan-800 bg-longan-900 text-rambutan-300 border-[0.5px] px-3 py-1">
      {text}
    </h3>
  );
}
