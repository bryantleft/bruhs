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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {scanning ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-grape bg-lychee-700 px-4 py-2 font-medium text-sm text-white transition hover:bg-lychee-600"
          >
            <X size={15} /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onScan}
            className="flex items-center gap-1.5 rounded-grape bg-guava-600 px-4 py-2 font-medium text-sm text-white transition hover:bg-guava-500"
          >
            <Search size={15} /> Scan whole disk
          </button>
        )}
        {!scanning && (
          <span className="text-lychee-500 text-xs">
            Scans your entire disk (<span className="font-mono">/</span>). May
            need Full Disk Access.
          </span>
        )}
      </div>

      {scanning && (
        <div className="flex items-center gap-3 rounded-grape border border-longan-700 bg-longan-900/60 px-3 py-2 text-sm">
          <Loader2 size={15} className="animate-spin text-guava-400" />
          <span className="text-lychee-300">
            {progress ? (
              <>
                <span className="font-mono text-lychee-100">
                  {progress.dirs.toLocaleString()}
                </span>{" "}
                dirs ·{" "}
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
                    · {progress.errors} skipped
                  </span>
                )}
              </>
            ) : (
              "Starting scan…"
            )}
          </span>
        </div>
      )}
    </div>
  );
}
