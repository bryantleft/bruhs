import { FolderOpen, HardDrive, House, Loader2, Search, X } from "lucide-react";
import { useState } from "react";
import { formatBytes } from "~/lib/format";
import type { ProgressEvent } from "~/lib/types";
import { cn } from "~/lib/utils";

interface Props {
  scanning: boolean;
  progress: ProgressEvent | null;
  onScan: (root: string) => void;
  onCancel: () => void;
  homeDir: string;
}

export function ScanControls({
  scanning,
  progress,
  onScan,
  onCancel,
  homeDir,
}: Props) {
  const [root, setRoot] = useState(homeDir);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-grape border border-longan-700">
          <Preset
            icon={<HardDrive size={14} />}
            label="Whole disk"
            onClick={() => setRoot("/")}
            active={root === "/"}
          />
          <Preset
            icon={<House size={14} />}
            label="Home"
            onClick={() => setRoot(homeDir)}
            active={root === homeDir}
          />
        </div>
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-grape border border-longan-700 bg-longan-900 px-3 py-2">
          <FolderOpen size={15} className="shrink-0 text-lychee-500" />
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !scanning && onScan(root)}
            placeholder="/path/to/scan"
            spellCheck={false}
            className="w-full bg-transparent font-mono text-lychee-100 text-sm outline-none placeholder:text-lychee-600"
          />
        </div>
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
            onClick={() => onScan(root)}
            className="flex items-center gap-1.5 rounded-grape bg-guava-600 px-4 py-2 font-medium text-sm text-white transition hover:bg-guava-500"
          >
            <Search size={15} /> Scan
          </button>
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

function Preset({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-sm transition",
        active
          ? "bg-blueberry-600 text-white"
          : "bg-longan-900 text-lychee-300 hover:bg-longan-800",
      )}
    >
      {icon} {label}
    </button>
  );
}
