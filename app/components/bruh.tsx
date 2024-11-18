import { useBruh, useExternalNavigation } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type BruhProps = {
	width?: number;
	height?: number;
};

export default function Bruh({ width = 60, height = 60 }: BruhProps) {
	const { x, y, isCentered, isBlinking, isHovered, setIsHovered } = useBruh(
		width,
		height,
	);
	const { navigate } = useExternalNavigation();

	return (
		<div
			onMouseDown={() => navigate("https://bnle.me")}
			className={cn(
				"fixed cursor-pointer rounded-full",
				"transition-all duration-1000 ease-in-out",
				isCentered
					? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
					: "top-4 left-4 translate-x-0 translate-y-0",
			)}
		>
			<div
				className={cn(
					"relative rounded-full",
					"transition-all duration-300 hover:scale-110",
					"shadow-lg hover:shadow-xl",
				)}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<svg
					width={width}
					height={height}
					viewBox="0 0 600 600"
					className="overflow-visible"
					aria-label="Bruh that follows mouse movement"
					role="img"
				>
					<defs>
						<style>
							{`
              .eye-ellipse, .mouth-ellipse {
                transition: all 0.3s ease-in-out;
              }
            `}
						</style>
					</defs>

					{/* Face */}
					<circle cx="300" cy="300" r="300" className="fill-royal-yellow" />

					{/* Eyes */}
					{[198, 401].map((cx) => (
						<g key={`eye-${cx}`} transform={`translate(${x} ${y})`}>
							<ellipse
								cx={cx}
								cy="218"
								rx="40"
								ry={isBlinking ? 4 : isHovered ? 20 : 10}
								className="fill-bruh-eye eye-ellipse"
							>
								<animate
									attributeName="ry"
									values="5;1;5"
									dur="0.3s"
									begin={isBlinking ? "0s" : "indefinite"}
								/>
							</ellipse>
						</g>
					))}

					{/* Mouth */}
					<g transform={`translate(${x} ${y})`}>
						<ellipse
							cx="307"
							cy="378"
							rx="120"
							ry={isHovered ? 40 : 10}
							className="fill-bruh-mouth mouth-ellipse"
						/>
					</g>
				</svg>
			</div>
		</div>
	);
}
