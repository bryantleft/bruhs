import { type Model, Provider } from "@/lib/types";
import type { Message } from "ai/react";

// TODO: add more
export const models: Model[] = [
	{ id: "gpt-4o-mini", name: "GPT-4o Mini", provider: Provider.OPENAI },
	{ id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: Provider.OPENAI },
	{ id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: Provider.OPENAI },
	{
		id: "claude-3-5-sonnet-latest",
		name: "Claude 3.5 Sonnet",
		provider: Provider.ANTHROPIC,
	},
	{
		id: "claude-3-5-haiku-latest",
		name: "Claude 3.5 Haiku",
		provider: Provider.ANTHROPIC,
	},
	{
		id: "claude-3-opus-latest",
		name: "Claude 3 Opus",
		provider: Provider.ANTHROPIC,
	},
];

export const defaultModel = models[0];

const systemMessage: Message = {
	id: "system-1",
	role: "system",
	content: "You are a helpful AI assistant.",
};

export const defaultMessages = [systemMessage];

export function modelLogo(provider: Provider): string {
	const width = 400;
	const height = 400;
	const clientId = "1id8ORhCPHW7oJZ3_xl";

	return `https://cdn.brandfetch.io/${provider}.com/w/${width}/h/${height}?c=${clientId}`;
}

// TODO: make own icon set :(
export function langIcon(lang: string) {
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
