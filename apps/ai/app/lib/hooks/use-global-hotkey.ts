import { useEffect, useMemo } from "react";

type HotkeyHandler = (event: KeyboardEvent) => void;

type HotkeySignature = {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

type RegisteredHotkey = {
  signature: HotkeySignature;
  handler: HotkeyHandler;
};

const hotkeyMap = new Set<RegisteredHotkey>();

const isMatch = (
  event: KeyboardEvent,
  { key, ctrl, alt, shift, meta }: HotkeySignature,
): boolean =>
  event.key.toLowerCase() === key.toLowerCase() &&
  (ctrl ?? false) === event.ctrlKey &&
  (alt ?? false) === event.altKey &&
  (shift ?? false) === event.shiftKey &&
  (meta ?? false) === event.metaKey;

const onKeyDown = (event: KeyboardEvent): void => {
  for (const { signature, handler } of hotkeyMap) {
    if (isMatch(event, signature)) {
      handler(event);
      break;
    }
  }
};

let isBound = false;

export const registerHotkey = (hotkey: RegisteredHotkey): void => {
  hotkeyMap.add(hotkey);
  if (!isBound) {
    window.addEventListener("keydown", onKeyDown);
    isBound = true;
  }
};

export const unregisterHotkey = (hotkey: RegisteredHotkey): void => {
  hotkeyMap.delete(hotkey);
  if (hotkeyMap.size === 0 && isBound) {
    window.removeEventListener("keydown", onKeyDown);
    isBound = false;
  }
};

type UseGlobalHotkeyOptions = {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  enabled?: boolean;
  handler: (event: KeyboardEvent) => void;
};

export const useGlobalHotkey = ({
  key,
  ctrl = false,
  alt = false,
  shift = false,
  meta = false,
  handler,
  enabled = true,
}: UseGlobalHotkeyOptions): void => {
  const signature = useMemo(
    () => ({ key, ctrl, alt, shift, meta }),
    [key, ctrl, alt, shift, meta],
  );

  useEffect(() => {
    if (!enabled) return;

    const hotkey = { signature, handler };
    registerHotkey(hotkey);
    return () => unregisterHotkey(hotkey);
  }, [signature, handler, enabled]);
};
