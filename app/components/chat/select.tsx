import { modelLogo, models } from "@/lib/data";
import { useLLMStore } from "@/lib/stores";
import type { Model } from "@/lib/types";
import { cn } from "@/lib/utils";
import React, { useState, useEffect, useRef } from "react";

export default function Select() {
	const { model, setModel } = useLLMStore();
	const [isOpen, setIsOpen] = useState(false);
	const selectRef = useRef<HTMLDivElement>(null);

	const handleOptionClick = async (option: Model) => {
		setModel(option);
		setIsOpen(false);
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				selectRef.current &&
				!selectRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	return (
		<div ref={selectRef} className="relative w-2/5">
			<div
				onMouseDown={() => setIsOpen(!isOpen)}
				className={cn(
					"p-1 bg-platinum-950 rounded cursor-pointer",
					"border-[0.5px] border-platinum-900 hover:border-platinum-800",
				)}
			>
				<div className="flex p-2 justify-between gap-x-2 items-center">
					<div className="flex items-center gap-x-2">
						<img
							src={modelLogo(model.provider)}
							alt={`${model.provider} logo`}
							width={20}
							height={20}
							className="rounded-full select-none"
						/>
						<span className="text-xs text-platinum-400 select-none">
							{model.name}
						</span>
					</div>
					<span
						className={cn(
							"iconify lucide--chevron-up text-platinum-800 transform w-5 h-5",
							isOpen ? "rotate-180" : "rotate-0",
						)}
					/>
				</div>
			</div>

			{isOpen && (
				<div className="absolute z-10 w-full mb-1 p-1 bg-platinum-950 border-[0.5px] border-platinum-900 rounded shadow-lg bottom-full">
					{models.map((model) => (
						<div
							key={model.id}
							className="flex items-center gap-x-2 p-2 hover:bg-platinum-800 cursor-pointer rounded"
							onMouseDown={() => handleOptionClick(model)}
						>
							<img
								src={modelLogo(model.provider)}
								alt={`${model.provider} logo`}
								width={20}
								height={20}
								className="rounded-full select-none"
							/>
							<span className="text-xs text-platinum-400 select-none">
								{model.name}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
