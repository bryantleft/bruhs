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
		<span key={randomKey()} className="text-sm text-platinum-300">
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
			<strong key={randomKey()} className="text-sm text-platinum-300">
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
			<span key={randomKey()} className="text-sm text-platinum-300">
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
			className="bg-onyx rounded-lg overflow-hidden my-3 border-[0.5px] border-platinum-800 drop-shadow-lg"
		>
			<div className="flex justify-between py-2 px-2 border-b-[0.5px] border-platinum-800">
				<div className="flex gap-x-1">
					{lang && (
						<span
							className={`${langIcon(highlightedLang)} w-4 h-4 text-amethyst-400`}
						/>
					)}
					<span className="text-xs text-platinum-500">{highlightedLang}</span>
				</div>
				<button
					type="button"
					onMouseDown={copyText}
					className="flex justify-center items-center cursor-pointer"
				>
					<span
						className={cn(
							"iconify w-4 h-4",
							isChecked
								? "lucide--check text-amethyst-400"
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
			className="text-sm bg-platinum-950 text-amethyst-400 rounded p-1 cursor-pointer"
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
				<span className="text-sm text-platinum-300">{text}</span>
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
			<ol
				key={randomKey()}
				className="list-decimal text-amethyst-400 text-sm pl-7"
			>
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
		<ul key={randomKey()} className="list-disc text-amethyst-400 text-sm pl-3">
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
			className="bg-onyx rounded-t-lg border-[0.5px] border-platinum-800 drop-shadow-lg text-platinum-300 px-3 py-1"
		>
			{text}
		</h3>
	);
}
