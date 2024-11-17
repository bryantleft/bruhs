import { useInitialLoad } from "@/lib/hooks";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type UserMessageProps = {
	message: Message;
	selected?: boolean;
};

export default function UserMessage({
	message,
	selected = false,
}: UserMessageProps) {
	const { isVisible } = useInitialLoad();
	const messageRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (selected && messageRef.current) {
			messageRef.current.focus();
			messageRef.current.scrollIntoView({
				behavior: "instant",
				block: "center",
			});
		}
	}, [selected]);

	return (
		<div className="flex flex-col gap-y-1">
			<div ref={messageRef} />
			<div
				className={cn(
					"rounded-xl bg-onyx p-3 border-[0.5px] border-onyx-800 hover:border-onyx-700",
					"transition-all duration-300 ease-in-out",
					isVisible ? "opacity-100" : "opacity-0",
					message.error && "border-ruby hover:border-ruby-500",
					selected &&
						"ring-2 ring-amethyst border-amethyst hover:border-amethyst",
				)}
			>
				<span className="text-sm text-onyx-200 whitespace-pre-line">
					{message.content}
				</span>
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
