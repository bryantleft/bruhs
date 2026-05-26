import { CATEGORY_VAR, categoryForName, formatBytes } from "~/lib/format";
import type { FileEntry } from "~/lib/types";

interface Props {
  files: FileEntry[];
  onSelect: (file: FileEntry) => void;
}

export function LargestFiles({ files, onSelect }: Props) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-lychee-300 text-xs uppercase tracking-wide">
        Largest files
      </h3>
      <ul className="space-y-0.5">
        {files.slice(0, 30).map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelect(f)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition hover:bg-longan-800"
            >
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{
                  background: `var(${CATEGORY_VAR[categoryForName(f.name)]})`,
                }}
              />
              <span
                className="min-w-0 flex-1 truncate text-lychee-200"
                title={f.path}
              >
                {f.name}
              </span>
              <span className="shrink-0 font-mono text-lychee-400">
                {formatBytes(f.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
