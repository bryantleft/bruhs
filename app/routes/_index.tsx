import Bruh from "@/components/bruh";
import Chat from "@/components/chat";
import { modelLogo } from "@/lib/data";
import { useExternalNavigation, useInitialScreenLoad } from "@/lib/hooks";
import { useMessageStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import type { MetaFunction } from "@remix-run/node";
import React from "react";

export const meta: MetaFunction = () => {
	return [{ title: "llm" }, { name: "description", content: "llm" }];
};

export default function Index() {
	const { clearMessageHistory } = useMessageStore();
	const { visible } = useInitialScreenLoad();
	const { navigate } = useExternalNavigation();

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
				<button
					type="button"
					className="fixed top-4 right-4 group transition-transform duration-300 hover:scale-105"
					onMouseDown={() => clearMessageHistory()}
				>
					<span className="iconify lucide--eraser text-platinum-400 group-hover:text-ruby-700 w-6 h-6" />
				</button>
				<div className="fixed bottom-4 right-4">
					<img
						src={modelLogo("github", { type: "symbol", theme: "light" })}
						alt={"github logo"}
						width={30}
						height={30}
						onMouseDown={() => navigate("https://github.com/bryantleft/llm")}
						className="rounded-full select-none cursor-pointer transition-transform duration-300 hover:scale-105"
					/>
				</div>
			</div>
		</div>
	);
}
