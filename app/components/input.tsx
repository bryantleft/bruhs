import { cn } from "@/lib/utils";

export default function Input() {
	return (
		<div>
			<input
				type="text"
				className={cn(
					"w-full rounded-full py-2 px-4",
					"text-[#E1E1E1] text-sm placeholder:text-[#9C9890]",
					"bg-[#262626] border border-[#363636]",
					"focus:outline-none focus:border-[#464646]",
				)}
				placeholder="Talk to Bruh..."
			/>
		</div>
	);
}
