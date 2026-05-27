import { CATEGORY_VAR, categoryForName, formatBytes } from "~/lib/format";
import type { FileEntry } from "~/lib/types";

interface Props {
  files: FileEntry[];
  onSelect: (file: FileEntry) => void;
}

export function LargestFiles({ files, onSelect }: Props) {
  if (files.length === 0) return null;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="shrink-0 font-medium text-[0.6875rem] text-lychee-500 uppercase tracking-wide">
        Largest files
      </h2>
      <ul className="-mx-2 min-h-0 flex-1 space-y-px overflow-y-auto">
        {files.map((f, i) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelect(f)}
              className="flex w-full items-center gap-2.5 rounded-grape px-2 py-1.5 text-left text-sm hover:bg-longan-800"
            >
              <span className="w-4 shrink-0 text-right font-mono text-[0.6875rem] text-lychee-600 tabular-nums">
                {i + 1}
              </span>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-seed"
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
              <span className="shrink-0 font-mono text-lychee-400 text-xs tabular-nums">
                {formatBytes(f.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
