import { get, set } from "idb-keyval";
import { z } from "zod";
import { StoredChatSchema, type StoredMessage } from "@/lib/types";

const CHATS_KEY = "chats";
const CHAT_ID = "chat-1";

/**
 * The saved conversation, without system messages (older versions stored one).
 * Data that doesn't match the current schema is ignored.
 */
export async function loadMessages(): Promise<StoredMessage[]> {
  const parsed = z.array(StoredChatSchema).safeParse(await get(CHATS_KEY));
  if (!parsed.success) return [];
  const chat = parsed.data.find((c) => c.id === CHAT_ID) ?? parsed.data[0];
  return chat?.messages.filter((m) => m.role !== "system") ?? [];
}

export async function saveMessages(messages: StoredMessage[]): Promise<void> {
  await set(CHATS_KEY, [{ id: CHAT_ID, title: "Chat 1", messages }]);
}
