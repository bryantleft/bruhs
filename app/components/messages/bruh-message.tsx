import { TokenBlock } from "@/components/messages/blocks";
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
		}
	}, [selected]);

	async function copyContent() {
		setIsCopied(await copyToClipboard(message.content));
		setTimeout(() => setIsCopied(false), 3000);
	}

	return (
		<div className="flex flex-col gap-y-1">
			<div ref={messageRef} />
			<div
				className={cn(
					"relative group flex flex-col gap-y-2 rounded-xl",
					"bg-platinum-900 p-3 border-[0.5px]",
					"transition-all duration-300 ease-in-out",
					"border-platinum-800 hover:border-platinum-700",
					message.error && "border-ruby hover:border-ruby-500",
					selected &&
						"ring-2 ring-amethyst border-amethyst hover:border-amethyst",
				)}
			>
				<img
					src="/bruhs/right.svg"
					alt="bruh"
					className="absolute -top-2 -left-2"
					width={20}
					height={20}
				/>
				{tokens.map((token) => {
					return <TokenBlock key={randomKey()} token={token} />;
				})}
				<div
					className={cn(
						"absolute -bottom-3 -right-3 p-[3px] rounded-lg",
						"bg-platinum-700 border-[0.5px] border-platinum-600",
						"opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out",
					)}
				>
					<button
						type="button"
						onMouseDown={copyContent}
						className={cn(
							"flex rounded justify-center items-center cursor-pointer",
							"group/copy hover:bg-platinum-800 px-1 py-[2px]",
						)}
					>
						<span
							className={cn(
								"iconify w-3 h-3",
								isCopied
									? "lucide--check text-amethyst-400"
									: "lucide--copy text-platinum-400",
							)}
						/>
						<span
							className={cn(
								"text-xs whitespace-nowrap",
								"max-w-0 group-hover/copy:max-w-[100px] group-hover/copy:pl-1",
								"overflow-hidden transition-all duration-300 ease-in-out",
								isCopied ? "text-amethyst-400" : "text-platinum-400",
							)}
						>
							{isCopied ? "Copied" : "Copy"}
						</span>
					</button>
				</div>
			</div>
			{message.error && (
				<div className="h-4 flex justify-start items-center">
					<div className="flex gap-x-1 justify-center items-center">
						<span className="iconify lucide--circle-alert text-ruby h-4 w-4" />
						<span className="text-xs text-ruby">{message.error}</span>
					</div>
				</div>
			)}
		</div>
	);
}
