import Bruh from "@/components/bruh";
import Chat from "@/components/chat";
import { useInitialLoad } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
	return [{ title: "llm" }, { name: "description", content: "llm" }];
};

export default function Index() {
	const { visible } = useInitialLoad();

	return (
		<div className="h-full">
			<Bruh />
			<div
				className={cn(
					"h-full transition-opacity duration-1000 ease-in-out",
					visible ? "opacity-100" : "opacity-0",
				)}
			>
				<Chat />
			</div>
		</div>
	);
}
