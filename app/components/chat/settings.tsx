import Select from "@/components/chat/select";
import { useLLMStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { type ChangeEvent, useEffect, useState } from "react";

// TODO: decouple from chat
// TODO: provide links for key access ease

export default function Settings() {
	const { keys, model, addKey, removeKey } = useLLMStore();
	const initialKey = keys ? (keys[model.provider] ?? "") : "";
	const [apiKey, setApiKey] = useState(initialKey);

	useEffect(() => {
		const key = keys ? (keys[model.provider] ?? "") : "";
		setApiKey(key);
	}, [keys, model]);

	const canAddKey = () => {
		return apiKey.length > 0;
	};

	const handleKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
		setApiKey(event.target.value);
	};

	const handleAddKey = () => {
		if (apiKey) {
			addKey(model.provider, apiKey);
		}
	};

	const handleRemoveKey = () => {
		removeKey(model.provider);
	};

	return (
		<div className="w-full flex justify-between">
			<Select />
			<div
				className={cn(
					"w-2/5 relative rounded overflow-hidden",
					"border-[0.5px] border-platinum-900 transition-colors duration-300",
					initialKey
						? "cursor-not-allowed"
						: "cursor-text hover:border-platinum-700",
				)}
			>
				<input
					type="password"
					value={apiKey}
					onChange={handleKeyChange}
					placeholder="sk-..."
					className={cn(
						"w-full h-full py-3 pl-4 pr-8 rounded",
						"bg-platinum-950 text-platinum-400 text-xs placeholder:text-platinum-400",
						"focus:outline-none transition-opacity duration-300",
						initialKey
							? "opacity-50 cursor-not-allowed"
							: "opacity-100 cursor-text",
					)}
					disabled={!!initialKey}
				/>
				<div
					className={cn(
						"absolute inset-y-0 flex items-center z-20",
						"transition-all duration-300",
						!initialKey
							? "opacity-100 right-0 pr-3"
							: "opacity-0 right-[calc(50%-12px)] pointer-events-none",
					)}
				>
					<button
						type="button"
						onMouseDown={handleAddKey}
						className={cn(
							"flex rounded-lg p-[5px] transition-colors duration-300",
							canAddKey()
								? "cursor-pointer bg-amethyst-700 hover:bg-amethyst-600"
								: "cursor-not-allowed",
							initialKey && "bg-amethyst",
						)}
						disabled={!canAddKey()}
					>
						<span className="iconify lucide--lock-open text-onyx-300 w-3 h-3" />
					</button>
				</div>
				<div
					className={cn(
						"absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10",
						"transition-all duration-300",
						initialKey ? "opacity-100" : "opacity-0 pointer-events-none",
					)}
				>
					<div className="flex rounded-lg bg-amethyst-700 p-[5px] cursor-not-allowed">
						<span className="iconify lucide--lock text-onyx-300 w-3 h-3" />
					</div>
				</div>
				<div
					className={cn(
						"absolute inset-y-0 right-0 pr-3 flex items-center z-20",
						"transition-opacity duration-300",
						initialKey ? "opacity-100" : "opacity-0 pointer-events-none",
					)}
				>
					<button
						type="button"
						onMouseDown={handleRemoveKey}
						className="flex rounded-lg p-[5px] cursor-pointer *:hover:text-ruby-700"
					>
						<span className="iconify lucide--trash text-platinum-400 transition-colors duration-300 w-3 h-3" />
					</button>
				</div>
			</div>
		</div>
	);
}
