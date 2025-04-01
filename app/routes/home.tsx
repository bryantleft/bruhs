import Text from "@/routes/text";

export function meta() {
	return [
		{ title: "Snip - Text Sharing" },
		{ name: "description", content: "Simple text sharing application" },
	];
}

export default function Index() {
	return <Text />;
}
