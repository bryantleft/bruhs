import BruhMessage from "@/components/messages/bruh-message";
import UserMessage from "@/components/messages/user-message";
import { useMessageStore } from "@/lib/stores";
import React, { useState, useEffect } from "react";

export default function MessageHistory() {
	const { messageHistory } = useMessageStore();
	const [selectedMessageId, setSelectedMessageId] = useState<string>("");

	useEffect(() => {
		const handleKeyPress = (event: KeyboardEvent) => {
			const activeElement = document.activeElement;

			if (activeElement) {
				const isInputFocused =
					activeElement.tagName === "INPUT" ||
					activeElement.tagName === "TEXTAREA" ||
					activeElement.tagName === "SELECT";

				if (isInputFocused) {
					return;
				}
			}

			if (event.key === "j" || event.key === "k") {
				event.preventDefault();

				setSelectedMessageId((currentId) => {
					if (currentId === "") {
						const newIndex = event.key === "k" ? messageHistory.length - 1 : 1;
						return messageHistory[newIndex].id;
					}

					const currentIndex = messageHistory.findIndex(
						(msg) => msg.id === currentId,
					);
					const newIndex =
						event.key === "k"
							? Math.max(1, currentIndex - 1)
							: Math.min(messageHistory.length - 1, currentIndex + 1);

					return messageHistory[newIndex].id;
				});
			}

			if (event.key === "Escape") {
				setSelectedMessageId("");
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [messageHistory]);

	return (
		<>
			{messageHistory.map((message) => {
				const isSelected = message.id === selectedMessageId;

				if (message.role === "assistant") {
					return (
						<BruhMessage
							key={message.id}
							content={message.content}
							selected={isSelected}
						/>
					);
				}

				if (message.role === "user") {
					return (
						<UserMessage content={message.content} selected={isSelected} />
					);
				}

				return null;
			})}
		</>
	);
}
