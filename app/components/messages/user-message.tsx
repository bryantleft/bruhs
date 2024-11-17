import { useInitialLoad } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type UserMessageProps = {
	content: string;
	selected?: boolean;
};

export default function UserMessage({ content, selected = false }: UserMessageProps) {
	const { isVisible } = useInitialLoad();

	return (
		<div
			className={cn(
				"rounded-xl bg-onyx p-3 border-[0.5px] border-onyx-800 hover:border-onyx-700",
				"transition-all duration-300 ease-in-out",
				isVisible ? "opacity-100" : "opacity-0",
				selected && "ring-2 ring-amethyst"
			)}
		>
			<span className="text-sm text-onyx-200 whitespace-pre-line">
				{content}
			</span>
		</div>
	);
}
