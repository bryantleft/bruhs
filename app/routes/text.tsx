import React, { useState, useRef, useEffect, useMemo } from "react";

type TextFormat = "plain" | "markdown";

interface FormatOption {
	value: TextFormat;
	label: string;
	shortcut: string;
}

// TODO: implement more options
const formatOptions: FormatOption[] = [
	{ value: "plain", label: "Plain Text", shortcut: "P" },
	// { value: "markdown", label: "Markdown", shortcut: "M" }
];

const textEncoder = new TextEncoder();

export default function Text() {
	const [text, setText] = useState("");
	const [format, setFormat] = useState<TextFormat>("plain");
	const [isFormatOpen, setIsFormatOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const selectedFormat =
		formatOptions.find((option) => option.value === format) ?? formatOptions[0];

	const countCharacters = useMemo(() => text.trim().length, [text]);
	const countWords = useMemo(
		() => (text.trim() ? text.trim().split(/\s+/).length : 0),
		[text],
	);
	const countBytes = useMemo(() => textEncoder.encode(text).length, [text]);

	useEffect(() => {
		if (!text) return;

		const textarea = textareaRef.current;
		if (!textarea) return;

		requestAnimationFrame(() => {
			textarea.style.height = "auto";
			textarea.style.height = `${textarea.scrollHeight}px`;
		});
	}, [text]);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsFormatOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (
				document.activeElement instanceof HTMLInputElement ||
				document.activeElement instanceof HTMLTextAreaElement
			)
				return;

			const key = event.key.toLowerCase();
			if (key === "p" || key === "m") {
				event.preventDefault();
				setFormat(key === "p" ? "plain" : "markdown");
				setIsFormatOpen(false);
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleShare = async () => {
		// TODO: Generate unique share link
		// TODO: Store contents on a public repo
		try {
			await navigator.clipboard.writeText(text);
			alert("Text copied to clipboard!");
		} catch (err) {
			console.error("Failed to copy text: ", err);
		}
	};

	return (
		<div className="container mx-auto flex flex-col px-4 py-16">
			<div className="w-full max-w-2xl mx-auto space-y-2">
				<div className="flex justify-between items-center">
					{/* Format Selector */}
					<div className="relative" ref={dropdownRef}>
						<button
							type="button"
							onClick={() => setIsFormatOpen(!isFormatOpen)}
							className="bg-zinc-900 border border-zinc-800 text-xs rounded-lg px-3 py-2 flex items-center space-x-2 text-gray-300 focus:outline-none hover:bg-zinc-800 transition-colors"
						>
							<span>{selectedFormat.label}</span>
							<span className="px-1.5 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">
								{selectedFormat.shortcut}
							</span>
							<svg
								className="w-3 h-3"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</button>

						{isFormatOpen && (
							<div className="absolute mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-10 overflow-hidden">
								<div className="py-2 px-1.5 space-y-1">
									{formatOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition-all 
                        ${format === option.value ? "bg-purple-500/20 text-purple-200 font-medium" : "text-gray-300 hover:bg-zinc-800 hover:text-gray-100"}`}
											onClick={() => setFormat(option.value)}
										>
											<span className="text-xs">{option.label}</span>
											<span className="px-1.5 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">
												{option.shortcut}
											</span>
										</button>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Word & Character Counts */}
					<div className="flex gap-2">
						{[
							{ label: "words", value: countWords },
							{ label: "characters", value: countCharacters },
							{ label: "bytes", value: countBytes },
						].map(({ label, value }) => (
							<div
								key={label}
								className="px-2 py-1 bg-zinc-900/50 rounded-lg border border-zinc-800/50"
							>
								<span className="text-gray-200/50 text-xs font-medium">
									{value}
								</span>
								<span className="text-gray-400/50 text-xs ml-1">{label}</span>
							</div>
						))}
					</div>
				</div>

				<div className="w-full bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg">
					<div className="p-1">
						<textarea
							ref={textareaRef}
							value={text}
							onChange={(e) => setText(e.target.value)}
							placeholder="Type or paste your text here..."
							className="w-full bg-zinc-900 text-gray-300 p-4 outline-none resize-none overflow-hidden min-h-32 placeholder-zinc-600 leading-relaxed"
						/>
					</div>
				</div>

				<div className="w-full flex justify-end">
					<button
						type="button"
						onClick={handleShare}
						className="px-3 py-2 bg-purple-700 hover:bg-purple-800 transition-colors text-xs font-medium text-white rounded-lg shadow-md focus:outline-none cursor-pointer"
					>
						Share
					</button>
				</div>
			</div>
		</div>
	);
}
