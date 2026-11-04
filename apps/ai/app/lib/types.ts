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

// The app's own message shape (persisted in IndexedDB). AI SDK 5+ replaced the
// `content` string with `parts`; convert at the useChat boundary instead.
export interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
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
