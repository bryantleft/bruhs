import { langIcon } from "@/lib/data";
import { cn, copyToClipboard, randomKey } from "@/lib/utils";
import type { Token } from "marked";
import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

type TokenBlockProps = {
  token: Token;
};

export function TokenBlock({ token }: TokenBlockProps) {
  if (token.type === "text") {
    return (
      <TextBlock key={randomKey()} tokens={token.tokens} text={token.text} />
    );
  }

  if (token.type === "strong") {
    return (
      <StrongBlock key={randomKey()} tokens={token.tokens} text={token.text} />
    );
  }

  if (token.type === "code") {
    return <CodeBlock key={randomKey()} lang={token.lang} text={token.text} />;
  }

  if (token.type === "paragraph") {
    return (
      <ParagraphBlock
        key={randomKey()}
        tokens={token.tokens}
        text={token.text}
      />
    );
  }

  if (token.type === "list") {
    return (
      <ListBlock
        key={randomKey()}
        items={token.items}
        ordered={token.ordered}
        start={token.start}
      />
    );
  }

  if (token.type === "codespan") {
    return <CodeSpanBlock key={randomKey()} text={token.text} />;
  }

  if (token.type === "heading") {
    return <HeadingBlock key={randomKey()} text={token.text} />;
  }

  return (
    <span key={randomKey()} className="text-platinum-300 text-sm">
      {token.raw}
    </span>
  );
}

type StrongBlockProps = {
  tokens: Token[] | undefined;
  text: string;
};

function StrongBlock({ tokens, text }: StrongBlockProps) {
  if (!tokens) {
    return (
      <strong key={randomKey()} className="text-platinum-300 text-sm">
        {text}
      </strong>
    );
  }

  return (
    <strong key={randomKey()}>
      {tokens.map((token) => {
        return <TokenBlock key={randomKey()} token={token} />;
      })}
    </strong>
  );
}

type TextBlockProps = {
  tokens: Token[] | undefined;
  text: string;
};

function TextBlock({ tokens, text }: TextBlockProps) {
  if (!tokens) {
    return (
      <span key={randomKey()} className="text-platinum-300 text-sm">
        {text}
      </span>
    );
  }

  return (
    <span key={randomKey()}>
      {tokens.map((token) => {
        return <TokenBlock key={randomKey()} token={token} />;
      })}
    </span>
  );
}

type CodeBlockProps = {
  lang: string | undefined;
  text: string;
};

function CodeBlock({ lang, text }: CodeBlockProps) {
  const [isChecked, setIsChecked] = useState<boolean>(false);
  const highlightedLang = lang ?? "text";

  async function copyText() {
    setIsChecked(await copyToClipboard(text));
    setTimeout(() => setIsChecked(false), 3000);
  }

  return (
    <div
      key={randomKey()}
      className="my-3 overflow-hidden rounded-lg border-[0.5px] border-platinum-800 bg-onyx drop-shadow-lg"
    >
      <div className="flex justify-between border-platinum-800 border-b-[0.5px] px-2 py-2">
        <div className="flex gap-x-1">
          {lang && (
            <span
              className={`${langIcon(highlightedLang)} h-4 w-4 text-amethyst-400`}
            />
          )}
          <span className="text-platinum-500 text-xs">{highlightedLang}</span>
        </div>
        <button
          type="button"
          onMouseDown={copyText}
          className="flex cursor-pointer items-center justify-center"
        >
          <span
            className={cn(
              "iconify h-4 w-4",
              isChecked
                ? "lucide--check text-emerald-400"
                : "lucide--copy text-platinum-400",
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

type CodeSpanBlockProps = {
  text: string;
};

function CodeSpanBlock({ text }: CodeSpanBlockProps) {
  async function copyText() {
    await copyToClipboard(text);
  }

  return (
    <code
      key={randomKey()}
      onMouseDown={copyText}
      className="cursor-pointer rounded bg-platinum-950 px-1 py-[0.5px] text-amethyst-400 text-sm"
    >
      {text}
    </code>
  );
}

type ParagraphBlockProps = {
  tokens: Token[] | undefined;
  text: string;
};

function ParagraphBlock({ tokens, text }: ParagraphBlockProps) {
  if (!tokens) {
    return (
      <p key={randomKey()}>
        <span className="text-platinum-300 text-sm">{text}</span>
      </p>
    );
  }

  return (
    <p key={randomKey()}>
      {tokens.map((token) => {
        return <TokenBlock key={randomKey()} token={token} />;
      })}
    </p>
  );
}

type ListItemBlockProps = {
  tokens: Token[];
  number?: number;
};

function ListItemBlock({ tokens, number }: ListItemBlockProps) {
  return (
    <li key={randomKey()}>
      {number && (
        <span className="pr-1 text-amethyst-400 text-sm">{number}.</span>
      )}
      {tokens.map((token) => {
        return <TokenBlock key={randomKey()} token={token} />;
      })}
    </li>
  );
}

// Copied from marked.d.ts
interface ListItem {
  type: "list_item";
  raw: string;
  task: boolean;
  checked?: boolean | undefined;
  loose: boolean;
  text: string;
  tokens: Token[];
}

type ListBlockProps = {
  items: ListItem[];
  ordered: boolean;
  start: number;
};

function ListBlock({ items, ordered, start }: ListBlockProps) {
  if (ordered) {
    return (
      <ol key={randomKey()}>
        {items.map((item, position) => {
          const number = position === 0 ? start : position + 1;
          return (
            <ListItemBlock
              key={randomKey()}
              tokens={item.tokens}
              number={number}
            />
          );
        })}
      </ol>
    );
  }

  return (
    <ul key={randomKey()} className="list-disc pl-3 text-amethyst-400 text-sm">
      {items.map((item) => {
        return <ListItemBlock key={randomKey()} tokens={item.tokens} />;
      })}
    </ul>
  );
}

type HeadingBlockProps = {
  text: string;
};

function HeadingBlock({ text }: HeadingBlockProps) {
  return (
    <h3
      key={randomKey()}
      className="rounded-t-lg border-[0.5px] border-platinum-800 bg-onyx px-3 py-1 text-platinum-300 drop-shadow-lg"
    >
      {text}
    </h3>
  );
}
