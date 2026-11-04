import clsx, { type ClassValue } from "clsx";
import { useSyncExternalStore } from "react";
import { twMerge } from "tailwind-merge";

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
