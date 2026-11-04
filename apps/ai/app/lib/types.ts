import type { UIMessage } from "ai";
import { z } from "zod";

export enum Provider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  XAI = "x",
}

export type ProviderMetadata = {
  domain: string;
  logo: string;
};

export enum InputType {
  TEXT = "text",
}

export enum OutputType {
  TEXT = "text",
}

export type Model = {
  id: string;
  name: string;
  provider: Provider;
  inputs: InputType[];
  outputs: OutputType[];
};

/** Saved API keys. Any provider may be missing. */
export type Keys = Partial<Record<Provider, string>>;

/** Per-message metadata the client attaches to `useChat` messages. */
export type ChatMetadata = {
  /** Why the reply to (or of) this message failed or stopped. */
  error?: string;
};

export type ChatMessage = UIMessage<ChatMetadata>;

/** The persisted message shape (IndexedDB). */
export const StoredMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  error: z.string().optional(),
});

export type StoredMessage = z.infer<typeof StoredMessageSchema>;

export const StoredChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(StoredMessageSchema),
});

export type StoredChat = z.infer<typeof StoredChatSchema>;

/** Machine-readable reasons `/api/llm` can fail. */
export type ChatErrorCode =
  | "invalid_request"
  | "unknown_model"
  | "missing_key"
  | "invalid_key"
  | "model_not_found"
  | "rate_limited"
  | "provider_rejected"
  | "provider_unavailable"
  | "provider_unreachable"
  | "unknown";

export const ChatErrorSchema = z.object({
  code: z.enum([
    "invalid_request",
    "unknown_model",
    "missing_key",
    "invalid_key",
    "model_not_found",
    "rate_limited",
    "provider_rejected",
    "provider_unavailable",
    "provider_unreachable",
    "unknown",
  ] satisfies ChatErrorCode[]),
  message: z.string(),
});

export type ChatError = z.infer<typeof ChatErrorSchema>;
