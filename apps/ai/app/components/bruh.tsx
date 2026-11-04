import { useChat } from "@ai-sdk/react";
import { type MouseEvent, useEffect, useState } from "react";
import { chat } from "@/lib/chat";
import { useExternalNavigation } from "@/lib/hooks/use-external-navigation";
import { useWindowDimensions } from "@/lib/hooks/use-window-dimensions";
import { type Coordinates, useBruhStore, useCommandStore } from "@/lib/stores";
import { cn } from "@/lib/utils";

const SIZE = 60;
const CORNER = { x: 12, y: 12 };
const HOME = "https://bruhs.dev";

/** Offset of the eyes and mouth (in SVG units) for a focus point, clamped to a radius. */
function eyeOffset(focus: Coordinates): Coordinates {
  const deltaX = focus.x - SIZE;
  const deltaY = focus.y - SIZE;
  const distance = Math.hypot(deltaX, deltaY);
  const maxDistance = 120;
  const scale = distance > maxDistance ? maxDistance / distance : 1;
  return { x: ((deltaX * scale) / 15) * 16, y: ((deltaY * scale) / 15) * 16 };
}

export default function Bruh() {
  const forceCentered = useBruhStore((s) => s.centered);
  const focusPosition = useBruhStore((s) => s.focusPosition);
  const setFocusPosition = useBruhStore((s) => s.setFocusPosition);
  const commandBarOpen = useCommandStore((s) => s.commandBarOpen);
  const { messages } = useChat({ chat, throttle: 250 });
  const viewport = useWindowDimensions();
  const { navigate } = useExternalNavigation();
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Derived during render: centred on an empty chat, or when asked to before leaving.
  const isCentered =
    forceCentered || (messages.length === 0 && !commandBarOpen);
  const windowLoaded = viewport.width > 0 && viewport.height > 0;
  const position = isCentered
    ? { x: viewport.width / 2 - SIZE / 2, y: viewport.height / 2 - SIZE / 2 }
    : CORNER;

  // In the centre the eyes follow the pointer across the whole window (as a
  // percentage); in the corner they follow it in pixels.
  const focus =
    isCentered && windowLoaded
      ? {
          x: (focusPosition.x / viewport.width) * 100,
          y: (focusPosition.y / viewport.height) * 100,
        }
      : { x: focusPosition.x + 16, y: focusPosition.y + 16 };
  const eyes = eyeOffset(focus);

  // Window listeners and timers with cleanup: legitimate effects.
  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) =>
      setFocusPosition({ x: e.clientX, y: e.clientY });
    globalThis.addEventListener("mousemove", onMove);
    return () => globalThis.removeEventListener("mousemove", onMove);
  }, [setFocusPosition]);

  useEffect(() => {
    if (isHovered) return;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    const blink = setInterval(() => {
      setIsBlinking(true);
      reopen = setTimeout(() => setIsBlinking(false), 300);
    }, 6000);
    return () => {
      clearInterval(blink);
      clearTimeout(reopen);
    };
  }, [isHovered]);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    // Let modified clicks open a new tab or window as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    navigate(HOME);
  };

  return (
    <a
      href={HOME}
      aria-label="Bruhs home"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "rounded-orb fixed z-20 cursor-pointer",
        "transition-all duration-800 ease-in-out",
        "focus-visible:outline-persimmon-400 focus-visible:outline-2 focus-visible:outline-offset-4",
      )}
      style={{
        top: windowLoaded ? position.y : `calc(50% - ${SIZE / 2}px)`,
        left: windowLoaded ? position.x : `calc(50% - ${SIZE / 2}px)`,
      }}
    >
      <div className="rounded-orb relative transition-transform duration-300 hover:scale-110">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox="0 0 600 600"
          className="overflow-visible"
          aria-hidden="true"
        >
          <circle cx="300" cy="300" r="300" className="fill-bruh-base" />
          {/* The transition on the group smooths the eyes toward the focus point. */}
          <g
            style={{ transform: `translate(${eyes.x}px, ${eyes.y}px)` }}
            className="transition-transform duration-150 ease-out"
          >
            {[198, 401].map((cx) => (
              <ellipse
                key={`eye-${cx}`}
                cx={cx}
                cy="218"
                rx="40"
                ry={isBlinking ? 4 : isHovered ? 20 : 10}
                className="fill-bruh-eye transition-all duration-300 ease-in-out"
              />
            ))}
            <ellipse
              cx="307"
              cy="378"
              rx="120"
              ry={isHovered ? 40 : 10}
              className="fill-bruh-mouth transition-all duration-300 ease-in-out"
            />
          </g>
        </svg>
      </div>
    </a>
  );
}
