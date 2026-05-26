import { useCallback, useRef, useState } from "react";
import type { ProgressEvent, ResultEvent, ScanEvent } from "~/lib/types";

export type ScanStatus = "idle" | "scanning" | "done" | "error";

export interface UseScan {
  status: ScanStatus;
  progress: ProgressEvent | null;
  result: ResultEvent | null;
  error: string | null;
  scan: (root: string, engine?: "bulk" | "std") => Promise<void>;
  loadSnapshot: () => Promise<boolean>;
  cancel: () => void;
}

/** Drives a streaming scan: reads the NDJSON response, surfacing live progress and the result. */
export function useScan(): UseScan {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<ResultEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const scan = useCallback(
    async (root: string, engine: "bulk" | "std" = "bulk") => {
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("scanning");
      setProgress(null);
      setResult(null);
      setError(null);

      try {
        const res = await fetch(
          `/api/scan?root=${encodeURIComponent(root)}&engine=${engine}`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok || !res.body)
          throw new Error(`Scan failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx = buf.indexOf("\n");
          while (idx >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line) handleEvent(line);
            idx = buf.indexOf("\n");
          }
        }
        const last = buf.trim();
        if (last) handleEvent(last);

        setStatus((s) => (s === "error" ? s : "done"));
      } catch (e) {
        if (controller.signal.aborted) {
          setStatus("idle");
          return;
        }
        setError(e instanceof Error ? e.message : "Scan failed");
        setStatus("error");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }

      function handleEvent(line: string) {
        let evt: ScanEvent;
        try {
          evt = JSON.parse(line) as ScanEvent;
        } catch {
          return; // ignore partial/non-JSON lines
        }
        if (evt.type === "progress") setProgress(evt);
        else if (evt.type === "result") setResult(evt as ResultEvent);
      }
    },
    [cancel],
  );

  const loadSnapshot = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/snapshot");
      if (res.status !== 200) return false;
      const data = (await res.json()) as ResultEvent;
      setResult(data);
      setStatus("done");
      return true;
    } catch {
      return false;
    }
  }, []);

  return { status, progress, result, error, scan, loadSnapshot, cancel };
}
