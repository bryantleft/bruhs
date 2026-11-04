import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import {
  APICallError,
  createUIMessageStreamResponse,
  type LanguageModel,
  RetryError,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { parseChatError } from "@/lib/chat-error";
import { findModel } from "@/lib/data";
import { type ChatError, type ChatErrorCode, Provider } from "@/lib/types";

const SYSTEM_PROMPT = "You are a helpful AI assistant.";

const StreamChatSchema = z.object({
  model: z.string().min(1),
  key: z.string().optional(),
  provider: z.enum(Provider),
  messages: z
    .array(
      z.object({
        // Older clients still send their system message; it's ignored.
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

/** HTTP status for each error code when it can be reported before streaming starts. */
const STATUS: Record<ChatErrorCode, number> = {
  invalid_request: 400,
  unknown_model: 400,
  missing_key: 401,
  invalid_key: 401,
  model_not_found: 404,
  rate_limited: 429,
  provider_rejected: 422,
  provider_unavailable: 502,
  provider_unreachable: 502,
  unknown: 500,
};

function errorResponse(error: ChatError): Response {
  return Response.json(error, { status: STATUS[error.code] });
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = StreamChatSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse({
      code: "invalid_request",
      message: issue
        ? `Invalid request: ${issue.path.join(".") || "body"} ${issue.message}`
        : "Invalid request",
    });
  }
  const data = parsed.data;

  if (!findModel(data.model, data.provider)) {
    return errorResponse({
      code: "unknown_model",
      message: `${data.model} isn't an available ${data.provider} model.`,
    });
  }
  if (!data.key) {
    return errorResponse({
      code: "missing_key",
      message: `Add an API key for ${data.provider} in Settings.`,
    });
  }

  const result = streamText({
    model: createLLMClient(data.provider, data.model, data.key),
    instructions: [{ role: "system", content: SYSTEM_PROMPT }],
    messages: data.messages.flatMap((m) =>
      m.role === "system" ? [] : [{ role: m.role, content: m.content }],
    ),
    abortSignal: request.signal,
  });

  const stream = toUIMessageStream({
    stream: result.stream,
    onError: (error) => JSON.stringify(toChatError(error, data.provider)),
  });

  // Most provider failures (bad key, unknown model, rate limit) happen before the first
  // token. Wait for the first real chunk so they can be answered with a proper status.
  const opened = await openStream(stream);
  if (opened.error) return errorResponse(opened.error);
  return createUIMessageStreamResponse({ stream: opened.stream });
}

/** Map a provider or network failure to a typed, user-presentable error. */
function toChatError(error: unknown, provider: Provider): ChatError {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (!APICallError.isInstance(cause)) {
    const message = cause instanceof Error ? cause.message : "Unknown error";
    return { code: "unknown", message };
  }
  const { statusCode, message } = cause;
  if (statusCode === undefined) {
    return {
      code: "provider_unreachable",
      message: `Couldn't reach ${provider}: ${message}`,
    };
  }
  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "invalid_key",
      message: `${provider} rejected the API key: ${message}`,
    };
  }
  if (statusCode === 404) return { code: "model_not_found", message };
  if (statusCode === 429) {
    return {
      code: "rate_limited",
      message: `${provider} rate limit: ${message}`,
    };
  }
  if (statusCode >= 500) {
    return {
      code: "provider_unavailable",
      message: `${provider} is unavailable (${statusCode}): ${message}`,
    };
  }
  return { code: "provider_rejected", message };
}

const OPENING_CHUNKS = new Set<UIMessageChunk["type"]>(["start", "start-step"]);

type OpenedStream =
  | { error: ChatError; stream?: undefined }
  | { error?: undefined; stream: ReadableStream<UIMessageChunk> };

/**
 * Read past the `start` chunks. If the first real chunk is an error, return it;
 * otherwise return a stream that replays what was read and continues with the rest.
 */
async function openStream(
  stream: ReadableStream<UIMessageChunk>,
): Promise<OpenedStream> {
  const reader = stream.getReader();
  const head: UIMessageChunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "error") {
      await reader.cancel();
      return { error: parseChatError(value.errorText) };
    }
    head.push(value);
    if (!OPENING_CHUNKS.has(value.type)) break;
  }
  return {
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of head) controller.enqueue(chunk);
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }),
  };
}

function createLLMClient(
  provider: Provider,
  model: string,
  key: string,
): LanguageModel {
  switch (provider) {
    case Provider.ANTHROPIC:
      return createAnthropic({ apiKey: key })(model);
    case Provider.XAI:
      return createXai({ apiKey: key })(model);
    case Provider.OPENAI:
      // AI SDK 5+ defaults to the Responses API; keep Chat Completions.
      return createOpenAI({ apiKey: key }).chat(model);
  }
}
