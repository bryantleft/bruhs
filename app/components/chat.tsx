import BruhMessage from "@/components/bruh-message";
import Settings from "@/components/settings";
import UserMessage from "@/components/user-message";
import { defaultMessages } from "@/lib/data";
import { useLLMStore, useMessageStore } from "@/lib/stores";
import { cn, randomKey } from "@/lib/utils";
import { type Message, useChat } from "ai/react";
import { type FormEvent, useEffect, useRef } from "react";

type LastMessageProps = {
	message: Message;
};

function LastMessage({ message }: LastMessageProps) {
	// TODO: custom stream ui
	return <BruhMessage key={message.id} content={message.content} last={true} />;
}

export default function Chat() {
	const { model, keys } = useLLMStore();
	const { messageHistory, addMessageHistory } = useMessageStore();
	const focusRef = useRef<HTMLDivElement>(null);

	const { messages, input, isLoading, handleInputChange, handleSubmit } =
		useChat({
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
		});

	function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
		const userMessage: Message = {
			id: randomKey(),
			role: "user",
			content: input,
		};
		addMessageHistory(userMessage);

		handleSubmit(e);
	}

	const lastMessage = messages[messages.length - 1];

	return (
		<div className="w-1/2 h-full mx-auto overscroll-none">
			<div className="w-[96%] flex flex-col mx-auto gap-y-4 pt-4 pb-32">
				{messageHistory.map((message) => {
					if (message.role === "assistant")
						return <BruhMessage key={message.id} content={message.content} />;
					if (message.role === "user")
						return <UserMessage key={message.id} content={message.content} />;
				})}
				{lastMessage.role === "assistant" && isLoading && (
					<LastMessage
						key={randomKey()}
						message={messages[messages.length - 1]}
					/>
				)}
				<div ref={focusRef} />
			</div>
			<form onSubmit={handleFormSubmit} className="fixed bottom-0 w-1/2 group">
				<div
					className={cn(
						"relative bg-onyx rounded-t-2xl overflow-hidden",
						"py-3",
						"border-t-[0.5px] border-x-[0.5px] border-onyx-800",
						"group-hover:border-onyx-700",
					)}
				>
					<input
						type="text"
						value={input}
						onChange={handleInputChange}
						className={cn(
							"w-full py-2 pl-4 pr-8",
							"bg-onyx text-onyx-200 text-sm placeholder:text-onyx-300",
							"focus:outline-none",
						)}
						placeholder="Talk to Bruh..."
					/>
					{input.length > 0 && (
						<div className="absolute inset-y-0 right-0 pr-3 flex items-center">
							<button
								type="submit"
								disabled={isLoading}
								className={cn(
									"flex rounded-lg bg-amethyst hover:bg-amethyst-500 p-[5px]",
								)}
							>
								<span className="iconify lucide--arrow-up text-onyx-300 w-4 h-4" />
							</button>
						</div>
					)}
				</div>
				<div
					className={cn(
						"bg-onyx px-3 pb-2",
						"border-x-[0.5px] border-onyx-800",
						"group-hover:border-onyx-700",
					)}
				>
					<Settings />
				</div>
			</form>
		</div>
	);
}
