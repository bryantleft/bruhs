import { useEffect, useRef, useState } from "react";

export default function Bruh() {
	const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
	const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
	const [isBlinking, setIsBlinking] = useState(false);
	const animationFrameRef = useRef<number>();

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			const x = (e.clientX / window.innerWidth) * 100;
			const y = (e.clientY / window.innerHeight) * 100;
			setMousePosition({ x, y });
		};

		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, []);

	useEffect(() => {
		const blinkInterval = setInterval(() => {
			setIsBlinking(true);
			setTimeout(() => setIsBlinking(false), 300);
		}, 6000);

		return () => clearInterval(blinkInterval);
	}, []);

	// Smooth animation loop
	useEffect(() => {
		const animate = () => {
			setCurrentPosition((prev) => {
				// Spring-like movement
				const springStrength = 0.08; // Lower = more delay and smoothing
				const dx = (mousePosition.x - prev.x) * springStrength;
				const dy = (mousePosition.y - prev.y) * springStrength;

				return {
					x: prev.x + dx,
					y: prev.y + dy,
				};
			});

			animationFrameRef.current = requestAnimationFrame(animate);
		};

		animationFrameRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [mousePosition]);

	const calculatePosition = () => {
		const moveX = (currentPosition.x - 50) / 15;
		const moveY = (currentPosition.y - 50) / 15;
		const maxMove = 4;
		const scale = 30;
		return {
			x: Math.min(Math.max(moveX, -maxMove), maxMove) * scale,
			y: Math.min(Math.max(moveY, -maxMove), maxMove) * scale,
		};
	};

	const { x, y } = calculatePosition();

	return (
		<div className="relative">
			<svg
				width="60"
				height="60"
				viewBox="0 0 600 600"
				className="overflow-visible"
			>
				{/* Face */}
				<circle cx="300" cy="300" r="300" className="fill-royal-yellow" />

				{/* Eyes */}
				{[198, 401].map((cx, index) => (
					<g key={index} transform={`translate(${x} ${y})`}>
						<ellipse
							cx={cx}
							cy="218"
							rx="40"
							ry={isBlinking ? 4 : 10}
							className="fill-bruh-eye"
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
						ry="10"
						className="fill-bruh-mouth"
					/>
				</g>
			</svg>
		</div>
	);
}
