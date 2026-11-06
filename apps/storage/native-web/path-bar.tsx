import { formatBytes } from "../src/lib/format";
import type { DirNode } from "../src/lib/types";

interface Props {
  /** The open folders, from the scanned folder down to the one on the map. */
  trail: readonly DirNode[];
  /** Go back to the folder at this index of the trail. */
  onOpen: (index: number) => void;
}

/** Where the map is within the scan: each folder is a step back up. */
export function PathBar({ trail, onOpen }: Props) {
  const current = trail.at(-1);
  return (
    <div className="flex min-h-8 min-w-0 shrink-0 items-center gap-3">
      <nav aria-label="Folder path" className="-ml-1.5 min-w-0 flex-1">
        <ol className="flex min-w-0 items-center">
          {trail.map((folder, index) => {
            const name = folder.name || "/";
            const last = index === trail.length - 1;
            return (
              <li
                key={folder.path}
                className={`flex min-w-0 items-center ${last ? "shrink-0" : ""}`}
              >
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="text-label-sm px-0.5 text-(--role-text-tertiary)"
                  >
                    ›
                  </span>
                )}
                {last ? (
                  <span
                    aria-current="location"
                    title={folder.path}
                    className="text-label-sm max-w-64 truncate px-1.5 py-1 text-(--role-text)"
                  >
                    {name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen(index)}
                    title={`Go back to ${folder.path}${index === trail.length - 2 ? " (⌘↑)" : ""}`}
                    className="text-label-sm rounded-seed max-w-40 min-w-0 truncate px-1.5 py-1 text-(--role-text-secondary) transition-colors hover:bg-(--role-hairline) hover:text-(--role-text)"
                  >
                    {name}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {current && (
        <span className="text-code-sm shrink-0 text-(--role-text-secondary) tabular-nums">
          {formatBytes(current.size)}
        </span>
      )}
    </div>
  );
}
