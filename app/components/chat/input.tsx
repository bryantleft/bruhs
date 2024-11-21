import { defaultMessages } from "@/lib/data";
import { useLLMStore, useMessageStore } from "@/lib/stores";
import type {APIError, Message} from '@/lib/types';
import { cn, randomKey } from "@/lib/utils";
import { useChat } from "ai/react";
import type React from "react";
import { type ChangeEvent, type FormEvent, useEffect, useRef } from "react";

export default function Input() {
	const { model, keys } = useLLMStore();
	const {
		input,
		messageHistory,
		lastMessage,
		generating,
		deleting,
		setInput,
		addMessage,
		addError,
		setLastMessage,
		setGenerating,
		setDeleting,
	} = useMessageStore();
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { messages, isLoading, setMessages, append, stop } = useChat({
		api: "/api/llm",
		body: {
			key: keys?.[model.provider],
			model: model.id,
			provider: model.provider,
		},
		initialMessages: defaultMessages,
		onError: (error) => {
			const errorMessage: APIError = JSON.parse(error.message);

			if (errorMessage.code === "invalid_api_key") {
				addError("Must populate a valid API key for openai");
			} else if (errorMessage.message === "invalid x-api-key") {
				addError("Must populate a valid API key for anthropic");
			} else {
				addError(errorMessage.message);
			}
		},
		onFinish: (message) => {
			addMessage(message);
		},
		experimental_throttle: 50,
	});

	useEffect(() => {
		function handleKeyPress(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				textareaRef.current?.focus();
			}

			if (e.key === "Escape") {
				textareaRef.current?.blur();
			}
		}

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, []);

	useEffect(() => {
		setGenerating(isLoading);
	}, [isLoading, setGenerating]);

	useEffect(() => {
		if (deleting) {
			setMessages(messageHistory);
			setDeleting(false);
		}
	}, [deleting, messageHistory, setMessages, setDeleting]);

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
		addMessage(userMessage);
		setInput("");
		await append(userMessage);
	}

	async function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
		addMessage(lastMessage);
		addError("Stopped");
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
