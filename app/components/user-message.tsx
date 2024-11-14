import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type UserMessageProps = {
	content: string;
};

export default function UserMessage({ content }: UserMessageProps) {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		setIsVisible(true);
	}, []);

	return (
		<div
			className={cn(
				"rounded-xl bg-onyx p-3 border-[0.5px] border-onyx-800 hover:border-onyx-700",
				"transition-opacity duration-300 ease-in-out",
				isVisible ? "opacity-100" : "opacity-0",
			)}
		>
			<span className="text-sm text-onyx-200">{content}</span>
		</div>
	);
}
