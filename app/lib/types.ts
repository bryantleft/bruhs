import type { Message as AIMessage } from "ai/react";

export enum Provider {
	OPENAI = "openai",
	ANTHROPIC = "anthropic",
}

export type Model = {
	id: string;
	name: string;
	provider: Provider;
};

export type Keys = { [key in Provider]: string };

export interface Message extends AIMessage {
	error?: string;
}

export type APIError = {
	message: string;
	type?: string;
	code?: string;
};
