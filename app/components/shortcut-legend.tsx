import { cn } from "@/lib/utils";
import { type ReactNode, useEffect, useState } from "react";

export default function ShortcutLegend() {
	const [isMac, setIsMac] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		setIsMac(navigator.userAgent.toLowerCase().indexOf("mac") >= 0);
	}, []);

	const shortcuts = [
		{ keys: isMac ? ["⌘", "k"] : ["ctrl", "k"], description: "Input" },
		{ keys: ["j"], description: "Next message" },
		{ keys: ["k"], description: "Previous message" },
		{ keys: isMac ? ["⌘", "c"] : ["ctrl", "c"], description: "Copy message" },
		{ keys: ["d"], description: "Delete message" },
		{ keys: ["esc"], description: "Clear selection" },
	];

	const toggleOpen = () => {
		setIsOpen(!isOpen);
	};

	const KeyButton = ({ children }: { children: ReactNode }) => (
		<kbd className="px-2 py-1 text-xs font-semibold bg-onyx-700 rounded shadow text-onyx-200 border border-onyx-600">
			{children}
		</kbd>
	);

	return (
		<div
			onMouseDown={toggleOpen}
			className={cn(
				"fixed top-1/2 left-4 -translate-y-1/2 group",
				"p-3 bg-onyx-800 rounded-lg shadow-lg",
				"border border-onyx-700 hover:border-onyx-600 text-onyx-200",
				"cursor-pointer transition-all duration-300 ease-in-out",
				isOpen ? "w-64" : "w-10 hover:w-32",
			)}
		>
			<div className="flex items-center">
				<div className="flex items-center gap-2">
					<span className="iconify lucide--keyboard text-onyx-200 w-4 h-4" />
					<h3
						className={cn(
							"font-semibold text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out",
							isOpen
								? "max-w-full opacity-100"
								: "max-w-0 opacity-0 group-hover:max-w-full group-hover:opacity-100",
						)}
					>
						Shortcuts
					</h3>
				</div>
			</div>

			<div
				className={cn(
					"space-y-2 overflow-hidden transition-all duration-300 ease-in-out",
					isOpen ? "max-h-96 opacity-100 mt-3" : "max-h-0 opacity-0",
				)}
			>
				{shortcuts.map((shortcut) => (
					<div
						key={shortcut.description}
						className="flex items-center gap-x-8 justify-between text-sm"
					>
						<span className="text-xs text-onyx-400">
							{shortcut.description}
						</span>
						<div className="flex gap-1">
							{shortcut.keys.map((key) => (
								<KeyButton key={key}>{key}</KeyButton>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
