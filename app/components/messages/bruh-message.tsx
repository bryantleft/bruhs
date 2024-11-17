import { TokenBlock } from "@/components/messages/blocks";
import { cn, copyToClipboard, randomKey } from "@/lib/utils";
import { marked } from "marked";
import { useState } from "react";

type BruhMessageProps = {
	content: string;
	selected?: boolean;
};

export default function BruhMessage({
	content,
	selected = false,
}: BruhMessageProps) {
	const [isChecked, setIsChecked] = useState<boolean>(false);
	const tokens = marked.lexer(content);

	async function copyContent() {
		setIsChecked(await copyToClipboard(content));
		setTimeout(() => setIsChecked(false), 3000);
	}

	return (
		<div
			className={cn(
				"relative group flex flex-col gap-y-2 rounded-xl",
				"bg-platinum-900 p-3 border-[0.5px]",
				"transition-all duration-300 ease-in-out",
				"border-platinum-800 hover:border-platinum-700",
				selected && "ring-2 ring-amethyst",
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
					"absolute -bottom-3 -right-3 px-2 py-1 rounded-lg",
					"bg-platinum-700 border-[0.5px] border-platinum-600",
					"opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out",
				)}
			>
				<button
					type="button"
					onMouseDown={copyContent}
					className="flex gap-x-1 justify-center items-center cursor-pointer"
				>
					<span
						className={cn(
							"iconify w-3 h-3",
							isChecked
								? "lucide--check text-amethyst-400"
								: "lucide--copy text-platinum-400",
						)}
					/>
					<span
						className={cn(
							"text-xs",
							isChecked ? "text-amethyst-400" : "text-platinum-400",
						)}
					>
						{isChecked ? "Copied" : "Copy"}
					</span>
				</button>
			</div>
		</div>
	);
}
