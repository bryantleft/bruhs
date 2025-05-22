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

export type Keys = Record<Provider, string>;

export interface Message extends AIMessage {
  error?: string;
}

export type APIError = {
  message: string;
  type?: string;
  code?: string;
};
