import Input from "@/components/chat/input";
import LastMessage from "@/components/chat/last-message";
import MessageHistory from "@/components/chat/message-history";
import Settings from "@/components/chat/settings";
import { cn } from "@/lib/utils";

export default function Chat() {
	return (
		<div className="w-1/2 h-full mx-auto overscroll-none">
			<div className="w-[96%] flex flex-col mx-auto gap-y-4 pt-4 pb-36">
				<MessageHistory />
				<LastMessage />
			</div>
			<div className="fixed bottom-0 w-1/2 group">
				<Input />
				<div
					className={cn(
						"bg-onyx px-3 pb-2",
						"border-x-[0.5px] border-onyx-800",
						"group-hover:border-onyx-700",
					)}
				>
					<Settings />
				</div>
			</div>
		</div>
	);
}
