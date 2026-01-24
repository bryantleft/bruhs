import { useEffect } from "react";
import { defaultChat } from "@/lib/data";
import { getChats, setChats } from "@/lib/idb";
import { useMessageStore } from "@/lib/stores";
import type { Chat } from "@/lib/types";

export const useMessageStoreSync = () => {
  const messages = useMessageStore((s) => s.messages);
  useEffect(() => {
    getChats().then((chats) => {
      if (chats && chats.length > 0) {
        useMessageStore.setState({ messages: chats[0].messages });
      }
    });
  }, []);
  useEffect(() => {
    const chat: Chat = { ...defaultChat, messages };
    setChats([chat]);
  }, [messages]);
};
