import { useEffect, useState } from "react";
import type { UsedSpace } from "../src/lib/treemap-layout.ts";

/**
 * A whole volume's used space as "Where the space is" accounts for it, which Pith sends beside a map of a whole volume:
 * the map's root, the used space the scan couldn't measure, which the map draws as its Not measured block there, and
 * the volume's used space, its Used on this disk, which the root's shares are of.
 */
export interface SentUsedSpace {
  readonly root: string;
  readonly usedSpace: UsedSpace;
}

declare global {
  interface Window {
    /**
     * The volume's used space for a map of a whole volume (`DiskModel.NotMeasured`): the map's root, the bytes not
     * measured and all the bytes used, or nulls for any other map.
     */
    pithReceiveNotMeasured: (
      root: unknown,
      bytes: unknown,
      used: unknown,
    ) => void;
  }
}

const isBytes = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** What Pith sent, as the page uses it: null for anything but a root and two byte counts, the used space the greater. */
export function readUsedSpace(
  root: unknown,
  bytes: unknown,
  used: unknown,
): SentUsedSpace | null {
  if (typeof root !== "string" || !isBytes(bytes) || !isBytes(used)) {
    return null;
  }
  return used >= bytes
    ? { root, usedSpace: { unmeasured: bytes, used } }
    : null;
}

/**
 * The used space of the volume a map of a whole volume shows, as Pith last sent it: once the page is ready and whenever
 * it changes, with the map it goes with or after it. Until then, and for any other map, none.
 */
export function useUsedSpace(): SentUsedSpace | null {
  const [sent, setSent] = useState<SentUsedSpace | null>(null);
  useEffect(() => {
    window.pithReceiveNotMeasured = (root, bytes, used) =>
      setSent(readUsedSpace(root, bytes, used));
    return () => {
      window.pithReceiveNotMeasured = () => {};
    };
  }, []);
  return sent;
}
