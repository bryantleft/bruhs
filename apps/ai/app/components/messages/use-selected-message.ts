import { type RefObject, useEffect, useRef } from "react";
import { useBruhStore } from "@/lib/stores";

/**
 * When the message becomes selected, scroll it into view and point the bruh at it.
 * Imperative DOM work, so it lives in an effect.
 */
export function useSelectedMessage(
  selected: boolean,
): RefObject<HTMLDivElement | null> {
  const setFocusPosition = useBruhStore((s) => s.setFocusPosition);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!selected || !element) return;
    element.scrollIntoView({ behavior: "instant", block: "center" });
    const rect = element.getBoundingClientRect();
    setFocusPosition({ x: rect.left, y: rect.top });
  }, [selected, setFocusPosition]);

  return ref;
}
