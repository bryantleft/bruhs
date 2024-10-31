import Bruh from "@/components/bruh";
import Input from "@/components/input";
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
	return [{ title: "Index" }, { name: "description", content: "Index" }];
};

export default function Index() {
	return (
		<div className="h-full flex flex-col bg-[#1d1d1d]">
			<div className="flex-[4] flex justify-center items-center">
				<Bruh />
			</div>
			<div className="flex-[1] flex justify-center items-center">
				<Input />
			</div>
		</div>
	);
}
