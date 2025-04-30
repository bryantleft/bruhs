import { defaultMessages, defaultModel } from "@/lib/data";
import type { Keys, Message, Model, Provider } from "@/lib/types";
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

type Coordinates = {
  x: number;
  y: number;
};

type BruhStore = {
  centered: boolean;
  focusPosition: Coordinates;
  setCentered: (centered: boolean) => void;
  setFocusPosition: (coordinates: Coordinates) => void;
};

export const useBruhStore = create<BruhStore>((set) => ({
  centered: true,
  focusPosition: { x: 60, y: 60 },
  setCentered: (centered) => set({ centered }),
  setFocusPosition: (coordinates) => set({ focusPosition: coordinates }),
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
  input: string;
  messageHistory: Message[];
  lastMessage: Message;
  selectedMessage: Message | null;
  generating: boolean;
  deleting: boolean;
  setInput: (input: string) => void;
  addMessage: (message: Message) => void;
  deleteMessage: (messagedId: string) => void;
  addError: (error: string) => void;
  clearMessageHistory: () => void;
  setLastMessage: (message: Message) => void;
  setSelectedMessage: (message: Message | null) => void;
  setGenerating: (generating: boolean) => void;
  setDeleting: (deleting: boolean) => void;
};

export const useMessageStore = create<MessageStore>((set) => ({
  input: "",
  messageHistory: defaultMessages,
  lastMessage: defaultMessages[0],
  selectedMessage: null,
  generating: false,
  deleting: false,
  setInput: (input) => set({ input }),
  addMessage: (message) => {
    set(({ messageHistory }) => ({
      messageHistory: [...messageHistory, message],
    }));
  },
  deleteMessage: (messageId) => {
    set(({ messageHistory }) => ({
      messageHistory: messageHistory.filter(
        (message) => message.id !== messageId,
      ),
      deleting: true,
    }));
  },
  addError: (error) => {
    set(({ messageHistory }) => {
      if (!messageHistory.length) return { messageHistory };

      return {
        messageHistory: [
          ...messageHistory.slice(0, -1),
          { ...messageHistory[messageHistory.length - 1], error },
        ],
      };
    });
  },
  clearMessageHistory: () => set({ messageHistory: defaultMessages }),
  setLastMessage: (message) => set({ lastMessage: message }),
  setSelectedMessage: (message) => set({ selectedMessage: message }),
  setGenerating: (generating) => set({ generating }),
  setDeleting: (deleting) => set({ deleting }),
}));
