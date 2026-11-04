import { type ChatError, ChatErrorSchema } from "@/lib/types";

/**
 * Read an error produced by `/api/llm`: either a JSON `{ code, message }` (the HTTP
 * error body, or the text of an error chunk in the stream) or any other text, such as
 * a browser network error.
 */
export function parseChatError(text: string): ChatError {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { code: "unknown", message: text || "Something went wrong." };
  }
  const parsed = ChatErrorSchema.safeParse(value);
  return parsed.success ? parsed.data : { code: "unknown", message: text };
}
