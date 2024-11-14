import { useInitialStore, useMessageStore } from "@/lib/stores";
import { useEffect, useRef, useState } from "react";

export const useBruh = (width: number, height: number) => {
	const { messageHistory } = useMessageStore();
	const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
	const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
	const [isCentered, setIsCentered] = useState(true);
	const [isBlinking, setIsBlinking] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const animationFrameRef = useRef<number>();

	useEffect(() => {
		setIsCentered(messageHistory.length < 2);
	}, [messageHistory]);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			const x = isCentered
				? (e.clientX / window.innerWidth) * 100
				: e.clientX + 16;
			const y = isCentered
				? (e.clientY / window.innerHeight) * 100
				: e.clientY + 16;

			setMousePosition({ x, y });
		};

		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, [isCentered]);

	useEffect(() => {
		const blinkInterval = setInterval(() => {
			if (!isHovered) {
				setIsBlinking(true);
				setTimeout(() => setIsBlinking(false), 300);
			}
		}, 6000);

		return () => clearInterval(blinkInterval);
	}, [isHovered]);

	useEffect(() => {
		const animate = () => {
			setCurrentPosition((prev) => {
				const springStrength = 0.08;
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
		const deltaX = currentPosition.x - width;
		const deltaY = currentPosition.y - height;

		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const maxDistance = 4 * 30;

		const scaleFactor = distance > maxDistance ? maxDistance / distance : 1;

		const moveX = (deltaX * scaleFactor) / 15;
		const moveY = (deltaY * scaleFactor) / 15;

		const scale = 16;

		return {
			x: moveX * scale,
			y: moveY * scale,
		};
	};

	const { x, y } = calculatePosition();

	return {
		x,
		y,
		isCentered,
		isBlinking,
		isHovered,
		setIsCentered,
		setIsBlinking,
		setIsHovered,
	};
};

export const useExternalNavigation = (link: string) => {
	const { setVisible } = useInitialStore();

	const navigate = () => {
		setVisible(false);
		setTimeout(() => {
			window.location.href = link;
		}, 1000);
	};

	return { navigate };
};

export const useInitialLoad = () => {
	const { visible, setVisible } = useInitialStore();

	useEffect(() => {
		setVisible(true);
	}, [setVisible]);

	return { visible };
};
