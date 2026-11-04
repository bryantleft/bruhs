import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { parseChatError } from "@/lib/chat-error";
import type { ChatMessage, StoredMessage } from "@/lib/types";

/** The plain text of a message (the app only sends and receives text parts). */
export function messageText(message: ChatMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

export function toStoredMessage(message: ChatMessage): StoredMessage {
  return {
    id: message.id,
    role: message.role,
    content: messageText(message),
    error: message.metadata?.error,
  };
}

export function fromStoredMessage(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
    metadata: message.error ? { error: message.error } : undefined,
  };
}

const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/llm",
  // Keep the request body the /api/llm action expects: { role, content } messages.
  prepareSendMessagesRequest: ({ id, messages, body }) => ({
    body: {
      ...body,
      id,
      messages: messages.map((message) => ({
        role: message.role,
        content: messageText(message),
      })),
    },
  }),
});

/** Attach an error note to the newest message (the failed or stopped exchange). */
export function markLastMessage(error: string): void {
  const last = chat.messages.at(-1);
  if (!last) return;
  chat.messages = [
    ...chat.messages.slice(0, -1),
    { ...last, metadata: { ...last.metadata, error } },
  ];
}

/**
 * The one conversation, shared by every component through `useChat({ chat })`. It is
 * the single source of truth for messages: persistence reads from and writes to it.
 */
export const chat = new Chat<ChatMessage>({
  transport,
  onError: (error) =>
    markLastMessage(
      // fetch rejects with a TypeError when the request never reached the server.
      error instanceof TypeError
        ? "Couldn't reach the server. Check your connection and try again."
        : parseChatError(error.message).message,
    ),
});
