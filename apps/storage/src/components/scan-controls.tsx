import { Loader2, Search, X } from "lucide-react";
import { formatBytes } from "~/lib/format";
import type { ProgressEvent } from "~/lib/types";

interface Props {
  scanning: boolean;
  progress: ProgressEvent | null;
  /** Start a whole-disk scan. */
  onScan: () => void;
  onCancel: () => void;
}

export function ScanControls({ scanning, progress, onScan, onCancel }: Props) {
  return (
    <div className="flex items-center gap-3">
      {scanning ? (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin text-guava-400" />
            <span className="text-lychee-300 tabular-nums">
              {progress ? (
                <>
                  <span className="font-mono text-lychee-100">
                    {progress.files.toLocaleString()}
                  </span>{" "}
                  files ·{" "}
                  <span className="font-mono text-persimmon-300">
                    {formatBytes(progress.bytes)}
                  </span>
                  {progress.errors > 0 && (
                    <span className="text-durian-400">
                      {" "}
                      · {progress.errors.toLocaleString()} skipped
                    </span>
                  )}
                </>
              ) : (
                "Starting scan…"
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-grape bg-longan-800 py-2 pr-3 pl-2 font-medium text-lychee-200 text-sm ring-1 ring-longan-700 ring-inset hover:bg-longan-700 focus-visible:outline-2 focus-visible:outline-lychee-400 focus-visible:outline-offset-2"
          >
            <X className="size-4 shrink-0" /> Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-lychee-500 text-sm max-md:hidden">
            Scans your entire disk (<span className="font-mono">/</span>)
          </span>
          <button
            type="button"
            onClick={onScan}
            className="flex items-center gap-1.5 rounded-grape bg-guava-600 py-2 pr-3 pl-2 font-medium text-sm text-white hover:bg-guava-500 focus-visible:outline-2 focus-visible:outline-guava-400 focus-visible:outline-offset-2"
          >
            <Search className="size-4 shrink-0" /> Scan whole disk
          </button>
        </>
      )}
    </div>
  );
}
