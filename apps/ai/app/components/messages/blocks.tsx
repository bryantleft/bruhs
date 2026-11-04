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

// Keep the theme's token colours, but let the `code-block` wrapper supply the
// surface, font and base text colour.
const PRE = 'pre[class*="language-"]';
const CODE = 'code[class*="language-"]';
const inheritType = {
  color: "inherit",
  fontFamily: "inherit",
  fontSize: "inherit",
  lineHeight: "inherit",
};
const codeStyle = {
  ...vscDarkPlus,
  [PRE]: {
    ...vscDarkPlus[PRE],
    ...inheritType,
    background: "transparent",
    margin: 0,
  },
  [CODE]: { ...vscDarkPlus[CODE], ...inheritType },
};

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
        <Tag className="text-rambutan-300">{text}</Tag>
      );
    }
    case "paragraph":
      return (
        <p className="text-body-sm text-rambutan-300">
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
      return <span className="text-rambutan-300">{token.raw}</span>;
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
    <div className="code-block rounded-grape my-3 overflow-hidden p-0">
      <div className="border-longan-800 flex justify-between border-b-[0.5px] px-2 py-2">
        <div className="flex gap-x-1">
          {lang && (
            <span
              aria-hidden="true"
              className={`${langIcon(highlightedLang)} text-mangosteen-400 h-4 w-4`}
            />
          )}
          <span className="text-code-sm text-rambutan-500">
            {highlightedLang}
          </span>
        </div>
        <button
          type="button"
          onClick={copyText}
          aria-label={isChecked ? "Copied" : "Copy code"}
          className="rounded-seed flex cursor-pointer items-center justify-center"
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
      <SyntaxHighlighter language={highlightedLang} style={codeStyle}>
        {text}
      </SyntaxHighlighter>
    </div>
  );
}

function CodeSpanBlock({ text }: { text: string }) {
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => copyToClipboard(text)}
      className="code-inline text-mangosteen-400 cursor-pointer"
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
        <span className="text-mangosteen-400 pr-1">{number}.</span>
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
    <ul className="text-body-sm text-mangosteen-400 list-disc pl-3">
      {items.map((item, position) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens only append while streaming, so position is stable.
        <ListItemBlock key={`${position}-${item.type}`} tokens={item.tokens} />
      ))}
    </ul>
  );
}

function HeadingBlock({ text }: { text: string }) {
  return (
    <h3 className="rounded-t-grape border-longan-800 bg-longan-900 text-body text-rambutan-300 border-[0.5px] px-3 py-1">
      {text}
    </h3>
  );
}
