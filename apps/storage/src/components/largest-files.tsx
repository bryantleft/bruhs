import { CATEGORY_VAR, categoryForName, formatBytes } from "~/lib/format";
import type { FileEntry } from "~/lib/types";

interface Props {
  files: readonly FileEntry[];
  onSelect: (file: FileEntry) => void;
}

export function LargestFiles({ files, onSelect }: Props) {
  if (files.length === 0) return null;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="text-eyebrow text-rambutan-500 shrink-0">Largest files</h2>
      <ul className="-mx-2 min-h-0 flex-1 space-y-px overflow-y-auto">
        {files.map((f, i) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelect(f)}
              className="menu-item gap-2.5 px-2"
            >
              <span className="text-code-sm text-rambutan-600 w-4 shrink-0 text-right tabular-nums">
                {i + 1}
              </span>
              <span
                aria-hidden="true"
                className="rounded-seed size-2.5 shrink-0"
                style={{
                  background: `var(${CATEGORY_VAR[categoryForName(f.name)]})`,
                }}
              />
              <span
                className="text-rambutan-200 min-w-0 flex-1 truncate"
                title={f.path}
              >
                {f.name}
              </span>
              <span className="text-code-sm text-rambutan-400 shrink-0 tabular-nums">
                {formatBytes(f.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
