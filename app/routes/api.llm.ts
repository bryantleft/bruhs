import { Provider } from "@/lib/types";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { ActionFunctionArgs } from "@remix-run/node";
import { APICallError, streamText } from "ai";
import { z } from "zod";

const StreamChatSchema = z.object({
	model: z.string().min(1),
	key: z.string().nullable(),
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

function llm(provider: Provider, model: string, key: string | null) {
	if (!key) return null;

	if (provider === Provider.ANTHROPIC) {
		const anthropic = createAnthropic({ apiKey: key });
		return anthropic(model);
	}

	const openai = createOpenAI({ apiKey: key });
	return openai(model);
}

export async function action({ request }: ActionFunctionArgs) {
	try {
		const body = await request.json();
		const data = StreamChatSchema.parse(body);
		const client = llm(data.provider, data.model, data.key);

		if (!client) {
			throw new Error(`Must populate an API key for ${data.provider}`);
		}

		const stream = await streamText({
			model: client,
			messages: data.messages,
		});

		return stream.toDataStreamResponse();
	} catch (error) {
		if (error instanceof APICallError) {
			// biome-ignore lint/suspicious/noExplicitAny: APICallError data unknown
			return new Response(JSON.stringify({ ...(error?.data as any)?.error }), {
				status: error.statusCode,
				headers: { "Content-Type": "application/json" },
			});
		}

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
