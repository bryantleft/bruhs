import LastMessage from "@/components/chat/last-message";
import BruhMessage from "@/components/messages/bruh-message";
import UserMessage from "@/components/messages/user-message";
import { useMessageStore } from "@/lib/stores";
import { copyToClipboard } from "@/lib/utils";
import React, { useEffect } from "react";
import { toast } from "sonner";

export default function MessageHistory() {
	const { messageHistory, selectedMessage, setSelectedMessage } =
		useMessageStore();

	useEffect(() => {
		const handleKeyPress = async (event: KeyboardEvent) => {
			const activeElement = document.activeElement;

			if (activeElement) {
				const isInputFocused =
					activeElement.tagName === "INPUT" ||
					activeElement.tagName === "TEXTAREA" ||
					activeElement.tagName === "SELECT";

				if (isInputFocused) {
					setSelectedMessage(null);
					return;
				}
			}

			if (event.key === "Escape") {
				event.preventDefault();
				setSelectedMessage(null);
			}

			if (event.key === "j" || event.key === "k") {
				event.preventDefault();

				if (!selectedMessage) {
					const newIndex = event.key === "k" ? messageHistory.length - 1 : 1;
					setSelectedMessage(messageHistory[newIndex]);
					return;
				}

				const currentIndex = messageHistory.findIndex(
					(msg) => msg.id === selectedMessage.id,
				);
				const newIndex =
					event.key === "k"
						? Math.max(1, currentIndex - 1)
						: Math.min(messageHistory.length - 1, currentIndex + 1);

				setSelectedMessage(messageHistory[newIndex]);
				return;
			}

			if (event.key === "c" && (event.ctrlKey || event.metaKey)) {
				if (!selectedMessage) return;

				await copyToClipboard(selectedMessage?.content);
				toast.custom(() => (
					<span className="text-platinum-400">
						Message <span className="text-amethyst-500">copied</span>
					</span>
				));
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [messageHistory, selectedMessage, setSelectedMessage]);

	return (
		<>
			{messageHistory.map((message) => {
				const isSelected = message.id === selectedMessage?.id;

				if (message.role === "assistant") {
					return (
						<BruhMessage
							key={message.id}
							message={message}
							selected={isSelected}
						/>
					);
				}

				if (message.role === "user") {
					return (
						<UserMessage
							key={message.id}
							message={message}
							selected={isSelected}
						/>
					);
				}

				return null;
			})}

			<LastMessage />
		</>
	);
}
