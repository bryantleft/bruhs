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
	addMessageHistory: (message: Message) => void;
};

export const useMessageStore = create<MessageStore>((set) => ({
	messageHistory: defaultMessages,
	addMessageHistory: (message) => {
		set(({ messageHistory }) => ({
			messageHistory: [...messageHistory, message],
		}));
	},
}));
