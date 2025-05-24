import type { Message as AIMessage } from "ai/react";

export enum Provider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  XAI = "x",
}

export type ProviderMetadata = {
  domain: string;
  logo: string;
};

type Pricing = {
  prompt: number;
  completion: number;
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
  pricing: Pricing;
  inputs: InputType[];
  outputs: OutputType[];
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

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
};
