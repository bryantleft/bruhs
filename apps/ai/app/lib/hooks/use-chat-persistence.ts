import type { ChatStatus } from "ai";
import { useEffect, useState } from "react";
import { chat, fromStoredMessage, toStoredMessage } from "@/lib/chat";
import { loadMessages, saveMessages } from "@/lib/idb";
import type { ChatMessage } from "@/lib/types";

/**
 * Restore the saved conversation into the chat once, then save it whenever it changes
 * outside of streaming. IndexedDB is an external system, so this is an effect.
 */
export function useChatPersistence(
  messages: ChatMessage[],
  status: ChatStatus,
): void {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMessages()
      .then((restored) => {
        // Don't overwrite a conversation the user started before the load finished.
        if (!cancelled && restored.length > 0 && chat.messages.length === 0) {
          chat.messages = restored.map(fromStoredMessage);
        }
      })
      .catch((error: unknown) => {
        console.error("Couldn't restore the saved chat", error);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || status === "streaming") return;
    saveMessages(messages.map(toStoredMessage)).catch((error: unknown) => {
      console.error("Couldn't save the chat", error);
    });
  }, [hydrated, messages, status]);
}
