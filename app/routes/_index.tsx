import Bruh from "@/components/bruh";
import Chat from "@/components/chat";
import ShortcutLegend from "@/components/shortcut-legend";
import { LogoIcon } from "@/lib/data";
import { useExternalNavigation, useInitialScreenLoad } from "@/lib/hooks";
import { useMessageStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { MetaFunction } from "@remix-run/node";
import React from "react";

export const meta: MetaFunction = () => {
	return [{ title: "llm" }, { name: "description", content: "llm" }];
};

function ClearHistoryButton() {
	const { clearMessageHistory } = useMessageStore();
	return (
		<Tooltip.Provider>
			<Tooltip.Root delayDuration={300}>
				<Tooltip.Trigger asChild>
					<button
						type="button"
						className="fixed top-4 right-4 group transition-transform duration-300 hover:scale-105 focus:outline-none"
						onMouseDown={() => clearMessageHistory()}
					>
						<span className="iconify lucide--eraser text-platinum-400 group-hover:text-ruby-700 w-6 h-6" />
					</button>
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content
						className="text-xs text-platinum-400"
						side="left"
						sideOffset={8}
					>
						Clear history
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</Tooltip.Provider>
	);
}

export default function Index() {
	const { visible } = useInitialScreenLoad();
	const { navigate } = useExternalNavigation();

	return (
		<div className="h-full">
			<div className="hidden md:block">
				<Bruh />
			</div>
			<div
				className={cn(
					"h-full transition-opacity duration-1000 ease-in-out",
					visible ? "opacity-100" : "opacity-0",
				)}
			>
				<Chat />
				<div className="hidden md:block">
					<ClearHistoryButton />
				</div>
				<div className="hidden md:block">
					<ShortcutLegend />
				</div>
				<div className="hidden md:block fixed bottom-4 left-4">
					<img
						src={LogoIcon("github", { type: "symbol", theme: "light" })}
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
