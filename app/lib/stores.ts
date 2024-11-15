import { defaultMessages, defaultModel } from "@/lib/data";
import type { Keys, Model, Provider } from "@/lib/types";
import type { Message } from "ai/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type InitialStore = {
	visible: boolean;
	setVisible: (visible: boolean) => void;
};

export const useInitialStore = create<InitialStore>((set) => ({
	visible: false,
	setVisible: (visible) => set({ visible }),
}));

type BruhStore = {
	centered: boolean;
	setCentered: (centered: boolean) => void;
};

export const useBruhStore = create<BruhStore>((set) => ({
	centered: true,
	setCentered: (centered) => set({ centered }),
}));

type LLMStore = {
	keys: Keys | null;
	model: Model;
	addKey: (provider: Provider, key: string) => void;
	removeKey: (provider: Provider) => void;
	setModel: (model: Model) => void;
};

export const useLLMStore = create<LLMStore>()(
	persist(
		(set) => ({
			keys: null,
			model: defaultModel,
			addKey: (provider, key) => {
				set(({ keys }) => ({
					keys: {
						...keys,
						[provider]: key,
					} as Keys,
				}));
			},
			removeKey: (provider) => {
				set(({ keys }) => {
					const newKeys = { ...keys };
					delete newKeys[provider];
					return { keys: newKeys as Keys };
				});
			},
			setModel: (model) => set({ model }),
		}),
		{
			name: "llm",
		},
	),
);

type MessageStore = {
	messageHistory: Message[];
	lastMessage: Message;
	generating: boolean;
	addMessageHistory: (message: Message) => void;
	clearMessageHistory: () => void;
	setLastMessage: (message: Message) => void;
	setGenerating: (generating: boolean) => void;
};

export const useMessageStore = create<MessageStore>((set) => ({
	messageHistory: defaultMessages,
	lastMessage: defaultMessages[0],
	generating: false,
	addMessageHistory: (message) => {
		set(({ messageHistory }) => ({
			messageHistory: [...messageHistory, message],
		}));
	},
	clearMessageHistory: () => set({ messageHistory: defaultMessages }),
	setLastMessage: (message) => set({ lastMessage: message }),
	setGenerating: (generating) => set({ generating }),
}));
