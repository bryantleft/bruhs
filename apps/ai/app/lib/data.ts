import {
  InputType,
  type Model,
  OutputType,
  Provider,
  type ProviderMetadata,
} from "@/lib/types";

const TEXT_TO_TEXT = {
  inputs: [InputType.TEXT],
  outputs: [OutputType.TEXT],
};

// IDs checked against each provider's model docs on 2026-11-03:
// developers.openai.com/api/docs/models, platform.claude.com/docs (API primer) and
// docs.x.ai/developers/grok-4-7.
export const models: readonly Model[] = [
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    provider: Provider.OPENAI,
    ...TEXT_TO_TEXT,
  },
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    provider: Provider.OPENAI,
    ...TEXT_TO_TEXT,
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    provider: Provider.OPENAI,
    ...TEXT_TO_TEXT,
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: Provider.ANTHROPIC,
    ...TEXT_TO_TEXT,
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    provider: Provider.ANTHROPIC,
    ...TEXT_TO_TEXT,
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    provider: Provider.ANTHROPIC,
    ...TEXT_TO_TEXT,
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: Provider.ANTHROPIC,
    ...TEXT_TO_TEXT,
  },
  {
    id: "grok-4.7",
    name: "Grok 4.7",
    provider: Provider.XAI,
    ...TEXT_TO_TEXT,
  },
];

export const defaultModel: Model = models[0];

/** The model with this ID and provider, or `undefined` if it isn't offered. */
export function findModel(id: string, provider?: Provider): Model | undefined {
  return models.find(
    (m) => m.id === id && (provider === undefined || m.provider === provider),
  );
}

export const ProviderInfo: Record<Provider, ProviderMetadata> = {
  [Provider.OPENAI]: {
    domain: "openai.com",
    logo: brandLogo("openai.com", { type: "symbol", theme: "light" }),
  },
  [Provider.ANTHROPIC]: {
    domain: "anthropic.com",
    logo: brandLogo("anthropic.com", { type: "icon" }),
  },
  [Provider.XAI]: {
    domain: "x.ai",
    logo: brandLogo("x.ai", { type: "icon" }),
  },
};

type LogoConfig = {
  type?: "icon" | "logo" | "symbol";
  theme?: "light" | "dark";
};

function brandLogo(domain: string, config?: LogoConfig): string {
  const width = 400;
  const height = 400;
  const size = `w/${width}/h/${height}`;

  const type = config && config.type !== "icon" ? `/${config.type}` : "";
  const theme = config && config.theme === "light" ? "/theme/light" : "";
  const clientId = "1id8ORhCPHW7oJZ3_xl";

  const path = `${size}${theme}${type}?c=${clientId}`;

  return `https://cdn.brandfetch.io/${domain}/${path}`;
}

// TODO: make own icon set :(
export function langIcon(lang: string): string {
  if (lang === "javascript") return "iconify vscode-icons--file-type-js";
  if (lang === "typescript")
    return "iconify vscode-icons--file-type-typescript";
  if (lang === "rust") return "iconify vscode-icons--file-type-rust";
  if (lang === "python") return "iconify vscode-icons--file-type-python";
  if (lang === "cpp") return "iconify vscode-icons--file-type-cpp";
  if (lang === "c") return "iconify vscode-icons--file-type-c";
  if (lang === "kotlin") return "iconify vscode-icons--file-type-kotlin";
  if (lang === "haskell") return "iconify vscode-icons--file-type-haskell";
  if (lang === "ruby") return "iconify vscode-icons--file-type-ruby";
  if (lang === "swift") return "iconify vscode-icons--file-type-swift";
  if (lang === "java") return "iconify vscode-icons--file-type-java";
  if (lang === "go") return "iconify vscode-icons--file-type-go";
  if (lang === "csharp") return "iconify vscode-icons--file-type-csharp";
  if (lang === "jsx" || lang === "tsx")
    return "iconify vscode-icons--file-type-reactjs";
  if (lang === "sql") return "iconify vscode-icons--file-type-sql";
  if (lang === "bash") return "iconify vscode-icons--file-type-shell";

  return "";
}
