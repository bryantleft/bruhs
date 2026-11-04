import { useCallback, useEffect, useRef, useState } from "react";
import { parseResultEvent, parseScanEvent } from "~/lib/protocol";
import type { ProgressEvent, ResultEvent, ScanEngine } from "~/lib/types";

export type ScanState =
  | { status: "idle" }
  | { status: "scanning"; progress: ProgressEvent | null }
  /** `id` changes with every new result, so views can reset their local state. */
  | { status: "done"; result: ResultEvent; id: number }
  | { status: "error"; message: string };

export interface UseScan {
  state: ScanState;
  scan: (root: string, engine?: ScanEngine) => Promise<void>;
  cancel: () => void;
}

/** Turn an NDJSON byte stream into complete, trimmed, non-empty lines. */
async function* readLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
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
      if (line) yield line;
      idx = buf.indexOf("\n");
    }
  }
  const last = buf.trim();
  if (last) yield last;
}

async function fetchSnapshot(signal: AbortSignal): Promise<ResultEvent | null> {
  const res = await fetch("/api/snapshot", { signal });
  if (res.status !== 200) return null;
  // A snapshot from an older scanner version parses to null and is ignored.
  return parseResultEvent(await res.json());
}

/**
 * Drives a streaming scan: reads the NDJSON response, surfacing live progress and the
 * result. On mount it shows the last cached scan; starting a scan cancels that load, so
 * a late snapshot can never replace a scan in progress.
 */
export function useScan(): UseScan {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const resultIdRef = useRef(0);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const begin = useCallback((): AbortController => {
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }, [cancel]);

  const finish = useCallback((result: ResultEvent) => {
    resultIdRef.current += 1;
    setState({ status: "done", result, id: resultIdRef.current });
  }, []);

  const scan = useCallback(
    async (root: string, engine: ScanEngine = "bulk") => {
      const controller = begin();
      const isCurrent = () => abortRef.current === controller;
      setState({ status: "scanning", progress: null });

      let result: ResultEvent | null = null;
      let failure: string | null = null;
      try {
        const res = await fetch(
          `/api/scan?root=${encodeURIComponent(root)}&engine=${engine}`,
          { signal: controller.signal },
        );
        if (!res.ok || !res.body) {
          throw new Error(`Scan failed (HTTP ${res.status})`);
        }
        for await (const line of readLines(res.body)) {
          const evt = parseScanEvent(line);
          if (evt?.type === "progress") {
            setState({ status: "scanning", progress: evt });
          } else if (evt?.type === "result") {
            result = evt;
          } else if (evt?.type === "fatal") {
            failure = `The scanner failed: ${evt.reason}`;
          } else if (evt?.type === "error") {
            failure = evt.stderr
              ? `${evt.message} ${evt.stderr.trim().split("\n").pop()}`
              : evt.message;
          }
        }
      } catch (e) {
        if (controller.signal.aborted) {
          if (isCurrent()) setState({ status: "idle" });
          return;
        }
        failure = e instanceof Error ? e.message : "Scan failed";
      }
      if (!isCurrent()) return;
      abortRef.current = null;

      if (failure !== null) setState({ status: "error", message: failure });
      else if (result) finish(result);
      else
        setState({ status: "error", message: "The scan returned no result." });
    },
    [begin, finish],
  );

  const cancelScan = useCallback(() => {
    cancel();
    setState((s) => (s.status === "scanning" ? { status: "idle" } : s));
  }, [cancel]);

  // Show the last cached scan on mount. This is a fetch with cleanup, kept in an effect
  // because it shares the abort controller with `scan`.
  useEffect(() => {
    const controller = begin();
    fetchSnapshot(controller.signal)
      .then((snapshot) => {
        if (snapshot && abortRef.current === controller) finish(snapshot);
      })
      .catch(() => {
        // No snapshot (or the load was cancelled): stay idle.
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
    return cancel;
  }, [begin, cancel, finish]);

  return { state, scan, cancel: cancelScan };
}
