import { defaultMessages } from "@/lib/data";
import { useLLMStore, useMessageStore } from "@/lib/stores";
import { cn, randomKey } from "@/lib/utils";
import { type Message, useChat } from "ai/react";
import {
	type ChangeEvent,
	type FormEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";

// TODO: add ui for errors and stop

export default function Input() {
	const { model, keys } = useLLMStore();
	const {
		lastMessage,
		generating,
		addMessageHistory,
		setLastMessage,
		setGenerating,
	} = useMessageStore();
	const [input, setInput] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { messages, isLoading, append, stop } = useChat({
		api: "/api/llm",
		body: {
			key: keys ? keys[model.provider] : null,
			model: model.id,
			provider: model.provider,
		},
		initialMessages: defaultMessages,
		onError: (error) => {
			console.error(error);
		},
		onFinish: (message) => {
			addMessageHistory(message);
		},
		experimental_throttle: 50,
	});

	useEffect(() => {
		setGenerating(isLoading);
	}, [isLoading, setGenerating]);

	useEffect(() => {
		setLastMessage(messages[messages.length - 1]);
	}, [messages, setLastMessage]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: input can change textarea height
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = "42px";
			const scrollHeight = textarea.scrollHeight;
			textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
		}
	}, [input]);

	function handleInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
		e.preventDefault();
		setInput(e.target.value);
	}

	async function handleSendMessage() {
		if (!input.trim() || generating) return;

		const userMessage: Message = {
			id: randomKey(),
			role: "user",
			content: input,
		};
		addMessageHistory(userMessage);

		setInput("");
		await append(userMessage);
	}

	async function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			await handleSendMessage();
		}
	}

	async function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		await handleSendMessage();
	}

	function handleStop() {
		stop();
		addMessageHistory(lastMessage);
	}

	return (
		<form
			onSubmit={handleFormSubmit}
			className={cn(
				"relative bg-onyx rounded-t-2xl overflow-hidden",
				"py-3",
				"border-t-[0.5px] border-x-[0.5px] border-onyx-800",
				"group-hover:border-onyx-700",
			)}
		>
			<div className="relative flex items-end px-4">
				<textarea
					ref={textareaRef}
					value={input}
					onChange={handleInputChange}
					rows={1}
					className={cn(
						"w-full resize-none py-2 mr-8",
						"bg-onyx text-onyx-200 text-sm placeholder:text-onyx-300",
						"focus:outline-none",
						"overflow-y-auto",
					)}
					placeholder="Bruhhhh..."
					onKeyDown={handleKeyDown}
				/>
				{input.trim().length > 0 && (
					<div className="absolute right-4 bottom-2">
						<button
							type="submit"
							disabled={generating}
							className={cn(
								"flex rounded-lg bg-amethyst-700 hover:bg-amethyst-600 p-[5px]",
								"transition-colors duration-200",
							)}
						>
							<span className="iconify lucide--arrow-up text-onyx-300 w-4 h-4" />
						</button>
					</div>
				)}
				{generating && (
					<div className="absolute right-4 bottom-2">
						<button
							type="button"
							onMouseDown={handleStop}
							className={cn(
								"relative flex items-center justify-center rounded-lg",
								"bg-amethyst-700 hover:bg-amethyst-600 p-[5px]",
								"transition-colors duration-200",
							)}
						>
							<span className="iconify lucide--loader-circle animate-spin text-onyx-300 w-4 h-4" />
							<span className="iconify lucide--dot text-onyx-300/60 w-2 h-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
						</button>
					</div>
				)}
			</div>
		</form>
	);
}
