import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
	return [{ title: "Index" }, { name: "description", content: "Index" }];
};

export default function Index() {
	return (
		<div>
			<h1 className="text-red-500 text-3xl">Index</h1>
		</div>
	);
}
