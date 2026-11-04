import { Search, X } from "lucide-react";
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
          <div className="text-body-sm flex items-center gap-2" role="status">
            <span
              aria-hidden="true"
              className="spinner text-pandan-400 size-4"
            />
            <span className="text-rambutan-300 tabular-nums">
              {progress ? (
                <>
                  <span className="text-rambutan-100">
                    {progress.files.toLocaleString()}
                  </span>{" "}
                  files ·{" "}
                  <span className="text-persimmon-300">
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
            className="btn btn-outline pl-2"
          >
            <X className="size-4 shrink-0" /> Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-body-sm text-rambutan-500 max-md:hidden">
            Scans your entire disk (/)
          </span>
          <button
            type="button"
            onClick={onScan}
            className="btn btn-primary pl-2"
          >
            <Search className="size-4 shrink-0" /> Scan whole disk
          </button>
        </>
      )}
    </div>
  );
}
