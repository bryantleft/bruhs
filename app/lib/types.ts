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
