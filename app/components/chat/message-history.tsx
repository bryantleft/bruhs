import React, { useState, useEffect } from 'react';
import BruhMessage from "@/components/messages/bruh-message";
import UserMessage from "@/components/messages/user-message";
import { useMessageStore } from "@/lib/stores";

export default function MessageHistory() {
	const { messageHistory } = useMessageStore();
	const [selectedMessageId, setSelectedMessageId] = useState<string>('');

	useEffect(() => {
		const handleKeyPress = (event: KeyboardEvent) => {
			const activeElement = document.activeElement;

			if (activeElement) {
				const isInputFocused =
					activeElement.tagName === 'INPUT' ||
					activeElement.tagName === 'TEXTAREA' ||
					activeElement.tagName === 'SELECT';

				if (isInputFocused) {
					return;
				}
			}

			if (event.key === 'j' || event.key === 'k') {
				event.preventDefault();

				setSelectedMessageId((currentId) => {
					const currentIndex = messageHistory.findIndex(msg => msg.id === currentId);
					let newIndex;

					if (currentId === '') {
						// If no message is selected, select the first/last message
						newIndex = event.key === 'k' ? messageHistory.length - 1 : 1;
					} else {
						// Move up or down in the message list
						newIndex = event.key === 'k'
							? Math.max(1, currentIndex - 1)
							: Math.min(messageHistory.length - 1, currentIndex + 1);
					}

					return messageHistory[newIndex]?.id || '';
				});
			}

			if (event.key === 'Escape') {
				setSelectedMessageId('');
			}
		};

		window.addEventListener('keydown', handleKeyPress);
		return () => window.removeEventListener('keydown', handleKeyPress);
	}, [messageHistory]);

	return (
		<>
			{messageHistory.map((message) => {
				const isSelected = message.id === selectedMessageId;

				if (message.role === "assistant") {
					return <BruhMessage key={message.id} content={message.content} selected={isSelected}/>;
				}

				if (message.role === "user") {
					return <UserMessage content={message.content} selected={isSelected}/>;
				}

				return null;
			})}
		</>
	);
}