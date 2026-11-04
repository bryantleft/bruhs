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
          <div className="flex items-center gap-2 text-sm" role="status">
            <Loader2 className="text-pandan-400 size-4 shrink-0 animate-spin" />
            <span className="text-rambutan-300 tabular-nums">
              {progress ? (
                <>
                  <span className="text-rambutan-100 font-mono">
                    {progress.files.toLocaleString()}
                  </span>{" "}
                  files ·{" "}
                  <span className="text-persimmon-300 font-mono">
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
            className="rounded-grape bg-longan-800 text-rambutan-200 ring-longan-700 hover:bg-longan-700 focus-visible:outline-persimmon-400 flex items-center gap-1.5 py-2 pr-3 pl-2 text-sm font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X className="size-4 shrink-0" /> Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-rambutan-500 text-sm max-md:hidden">
            Scans your entire disk (<span className="font-mono">/</span>)
          </span>
          <button
            type="button"
            onClick={onScan}
            className="rounded-grape bg-persimmon-500 text-longan-950 hover:bg-persimmon-400 focus-visible:outline-persimmon-400 flex items-center gap-1.5 py-2 pr-3 pl-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Search className="size-4 shrink-0" /> Scan whole disk
          </button>
        </>
      )}
    </div>
  );
}
