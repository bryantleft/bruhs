import clsx, { type ClassValue } from "clsx";
import { useSyncExternalStore } from "react";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge reads unknown `text-*` classes as colours, so without this
// `cn("text-label-sm text-rambutan-400")` would drop the type role. Teach it the
// Bruhs roles, radii, motion tokens and stacking layers.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display-lg",
        "display-md",
        "display-sm",
        "h1",
        "h2",
        "h3",
        "h4",
        "body-lg",
        "body",
        "body-sm",
        "label-lg",
        "label",
        "label-sm",
        "code-lg",
        "code",
        "code-sm",
        "button-lg",
        "button",
        "button-sm",
        "callout",
        "eyebrow",
      ],
      radius: ["seed", "grape", "lychee", "mango", "pomelo", "orb"],
      ease: ["standard", "entrance", "exit", "bloom"],
    },
    classGroups: {
      z: [
        {
          z: [
            "raised",
            "sticky",
            "overlay",
            "modal",
            "popover",
            "toast",
            "tooltip",
          ],
        },
      ],
      duration: [{ duration: ["blink", "fast", "standard", "slow", "bloom"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

const noSubscription = () => () => {};

/**
 * The platform's command key label. The server can't know the platform, so it renders
 * "⌘" and the client switches after hydration without a mismatch.
 */
export function useMetaKey(): "⌘" | "Ctrl" {
  return useSyncExternalStore(noSubscription, getMetaKey, () => "⌘");
}

function getMetaKey(): "⌘" | "Ctrl" {
  return navigator.userAgent.toLowerCase().indexOf("mac") >= 0 ? "⌘" : "Ctrl";
}
