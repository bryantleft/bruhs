import type { Message as AIMessage } from "ai/react";

export enum Provider {
	OPENAI = "openai",
	ANTHROPIC = "anthropic",
	XAI = "x",
}

export type ProviderMetadata = {
	domain: string;
}

type Company = {
	name: string;
	domain: string;
}

export type Model = {
	id: string;
	name: string;
	provider: Provider;
};

export type Keys = Record<Provider, string>;

export interface Message extends AIMessage {
	error?: string;
}

export type APIError = {
	message: string;
	type?: string;
	code?: string;
};
