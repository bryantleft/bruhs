import { useCallback, useEffect, useState } from "react";
import { useExternalNavigation } from "@/lib/hooks/use-external-navigation";
import { useWindowDimensions } from "@/lib/hooks/use-window-dimensions";
import { useBruhStore, useCommandStore, useMessageStore } from "@/lib/stores";
import { cn } from "@/lib/utils";

export default function Bruh() {
  const dimensions = { width: 60, height: 60 };

  const { centered, focusPosition } = useBruhStore();
  const commandBarOpen = useCommandStore((s) => s.commandBarOpen);
  const messages = useMessageStore((s) => s.messages);
  const windowDimensions = useWindowDimensions();
  const { navigate } = useExternalNavigation();

  const [localFocusPosition, setLocalFocusPosition] = useState(focusPosition);
  const [position, setPosition] = useState({
    x: windowDimensions.width / 2 - dimensions.width / 2,
    y: windowDimensions.height / 2 - dimensions.height / 2,
  });
  const [eyePosition, setEyePosition] = useState({
    x: dimensions.width,
    y: dimensions.height,
  });
  const [isCentered, setIsCentered] = useState(centered);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setIsCentered(messages.length < 2 && !commandBarOpen);
  }, [messages, commandBarOpen]);

  useEffect(() => {
    setLocalFocusPosition(focusPosition);
  }, [focusPosition]);

  useEffect(() => {
    function updatePosition() {
      if (isCentered) {
        setPosition({
          x: windowDimensions.width / 2 - dimensions.width / 2,
          y: windowDimensions.height / 2 - dimensions.height / 2,
        });
      } else {
        setPosition({ x: 12, y: 12 });
      }
    }
    updatePosition();
  }, [isCentered, windowDimensions.width, windowDimensions.height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = isCentered
        ? (e.clientX / window.innerWidth) * 100
        : e.clientX + 16;
      const y = isCentered
        ? (e.clientY / window.innerHeight) * 100
        : e.clientY + 16;
      setLocalFocusPosition({ x, y });
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
      setEyePosition((prev) => {
        const springStrength = 0.08;
        const dx = (localFocusPosition.x - prev.x) * springStrength;
        const dy = (localFocusPosition.y - prev.y) * springStrength;
        return {
          x: prev.x + dx,
          y: prev.y + dy,
        };
      });
    };
    animate();
  }, [localFocusPosition]);

  const calculateEyePosition = useCallback(() => {
    const deltaX = eyePosition.x - dimensions.width;
    const deltaY = eyePosition.y - dimensions.height;
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
  }, [eyePosition]);

  const windowLoaded =
    windowDimensions.width > 0 && windowDimensions.height > 0;
  const eyePos = calculateEyePosition();

  return (
    <button
      type="button"
      onMouseDown={() => navigate("https://bruhs.dev")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed z-20 cursor-pointer rounded-full",
        "transition-all duration-800 ease-in-out",
      )}
      style={{
        top: windowLoaded
          ? position.y
          : `calc(50% - ${dimensions.height / 2}px)`,
        left: windowLoaded
          ? position.x
          : `calc(50% - ${dimensions.width / 2}px)`,
      }}
    >
      <div
        className={cn(
          "relative rounded-full",
          "transition-all duration-300 hover:scale-110",
          "shadow-lg hover:shadow-xl",
        )}
      >
        <svg
          width={dimensions.width}
          height={dimensions.height}
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
          <circle cx="300" cy="300" r="300" className="fill-bruh-base" />
          {[198, 401].map((cx) => (
            <g
              key={`eye-${cx}`}
              transform={`translate(${eyePos.x} ${eyePos.y})`}
            >
              <ellipse
                cx={cx}
                cy="218"
                rx="40"
                ry={isBlinking ? 4 : isHovered ? 20 : 10}
                className="eye-ellipse fill-bruh-eye"
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
          <g transform={`translate(${eyePos.x} ${eyePos.y})`}>
            <ellipse
              cx="307"
              cy="378"
              rx="120"
              ry={isHovered ? 40 : 10}
              className="mouth-ellipse fill-bruh-mouth"
            />
          </g>
        </svg>
      </div>
    </button>
  );
}
