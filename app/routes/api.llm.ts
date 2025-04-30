import { Provider } from "@/lib/types";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { streamText } from "ai";
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";

const StreamChatSchema = z.object({
  model: z.string().min(1),
  key: z.string().optional(),
  provider: z.nativeEnum(Provider),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const data = StreamChatSchema.parse(body);
    const client = await createLLMClient(data.provider, data.model, data.key);

    const stream = streamText({
      model: client,
      messages: data.messages,
    });

    return stream.toDataStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

type ProviderConfig = {
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

async function validateApiKey(
  provider: Provider,
  key: string,
  model: string,
): Promise<boolean> {
  if (!key) return false;

  const configs: { [key in Provider]: ProviderConfig } = {
    [Provider.ANTHROPIC]: {
      endpoint: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1,
        messages: [{ role: "user", content: "test" }],
      }),
    },
    [Provider.XAI]: {
      endpoint: `https://api.x.ai/v1/models/${model}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    },
    [Provider.OPENAI]: {
      endpoint: `https://api.openai.com/v1/models/${model}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    },
  };

  const config = configs[provider];
  if (!config) throw new Error(`Unsupported provider: ${provider}`);

  try {
    const response = await fetch(config.endpoint, {
      method: config.method,
      headers: config.headers,
      ...(config.body && { body: config.body }),
    });

    return response.ok;
  } catch (error) {
    console.error(`${provider} key validation error:`, error);
    return false;
  }
}

async function createLLMClient(
  provider: Provider,
  model: string,
  key: string | undefined,
) {
  if (!key) {
    throw new Error(`Must populate an API key for ${provider}`);
  }

  const isValidKey = await validateApiKey(provider, key, model);

  if (!isValidKey) {
    throw new Error(`Must provide a valid API key for ${provider}`);
  }

  switch (provider) {
    case Provider.ANTHROPIC:
      return createAnthropic({ apiKey: key })(model);
    case Provider.XAI:
      return createXai({ apiKey: key })(model);
    case Provider.OPENAI:
      return createOpenAI({ apiKey: key })(model);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
