import { type ReactNode, useMemo } from "react";
import { parentFolder, splitFolder, splitName } from "~/lib/display-names";
import { CATEGORY_VAR, categoryForName, formatBytes } from "~/lib/format";
import type { FileEntry } from "~/lib/types";
import { rowLabel, selectedRow } from "./map-selection";

interface Props {
  files: readonly FileEntry[];
  onSelect: (file: FileEntry) => void;
  /**
   * A ⌘-click on a row: add its file to the selection, or take it out, for a host that keeps several, as Pith does.
   * Without it a ⌘-click selects as a click does.
   */
  onToggle?: (file: FileEntry) => void;
  /** The selected paths, each marked in the list. */
  selectedPaths?: readonly string[];
  /** A path hovered on the map: its row, and rows inside it, are highlighted. */
  hoveredPath?: string | null;
  /** The row under the pointer or keyboard focus changed, for linking the map. */
  onHoverPath?: (path: string | null) => void;
  /** Show each file's folder from this folder down; otherwise its full path. */
  base?: string;
  /** Right-click on a row: show the file's actions. Without it there's no menu. */
  onMenu?: (file: FileEntry) => void;
  /**
   * Each file's 16 px icon in place of its swatch, for a host that has icons: Pith's page shows macOS's own. It gets
   * the file and its swatch, to show when there's no icon for it. Without it the rows lead with their swatches.
   */
  icon?: (file: FileEntry, swatch: ReactNode) => ReactNode;
}

const inside = (path: string, folder: string) =>
  path === folder || path.startsWith(folder === "/" ? "/" : `${folder}/`);

/**
 * Colours use the host's semantic roles when it defines them (Pith's web view follows the
 * system appearance) and fall back to bruhs's dark tokens.
 */
export function LargestFiles({
  files,
  onSelect,
  onToggle,
  selectedPaths = [],
  hoveredPath = null,
  onHoverPath,
  base,
  onMenu,
  icon,
}: Props) {
  // Worked out once per list, so hovering only changes which rows are highlighted.
  const rows = useMemo(
    () =>
      files.map((file) => {
        const folderPath = parentFolder(file.path, base);
        return {
          file,
          folderPath,
          name: splitName(file.name),
          folder: splitFolder(folderPath),
          size: formatBytes(file.size),
          color: `var(${CATEGORY_VAR[categoryForName(file.name)]})`,
        };
      }),
    [files, base],
  );
  if (rows.length === 0) return null;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <h2 className="text-eyebrow shrink-0 text-(--role-text-tertiary,var(--color-rambutan-500))">
        Largest files
      </h2>
      <ul className="-mx-2 min-h-0 flex-1 space-y-px overflow-y-auto">
        {rows.map(({ file: f, folderPath, name, folder, size, color }) => {
          return (
            <li key={f.path}>
              <button
                type="button"
                onClick={(event) =>
                  event.metaKey && onToggle ? onToggle(f) : onSelect(f)
                }
                onContextMenu={
                  onMenu
                    ? (event) => {
                        event.preventDefault();
                        // A file selected already keeps the selection, whose items the menu acts on.
                        if (!selectedPaths.includes(f.path)) onSelect(f);
                        onMenu(f);
                      }
                    : undefined
                }
                onMouseEnter={() => onHoverPath?.(f.path)}
                onMouseLeave={() => onHoverPath?.(null)}
                onFocus={() => onHoverPath?.(f.path)}
                onBlur={() => onHoverPath?.(null)}
                aria-label={rowLabel(
                  `${f.name}, ${size}, in ${folderPath}`,
                  selectedPaths.includes(f.path),
                )}
                {...selectedRow(selectedPaths.includes(f.path))}
                data-highlighted={
                  hoveredPath !== null && inside(f.path, hoveredPath)
                    ? ""
                    : undefined
                }
                title={f.path}
                className="menu-item items-start gap-2 px-2 py-1 data-selected:bg-(--role-selection,var(--color-persimmon-950))"
              >
                {icon ? (
                  // The swatch, when it stands in, keeps the icon's room, so the names stay in line.
                  <span
                    aria-hidden="true"
                    className="mt-px flex size-4 shrink-0 items-center justify-center"
                  >
                    {icon(
                      f,
                      <span
                        className="rounded-seed size-2.5"
                        style={{ background: color }}
                      />,
                    )}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="rounded-seed mt-1 size-2.5 shrink-0"
                    style={{ background: color }}
                  />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-code-sm flex min-w-0 text-(--role-text,var(--color-rambutan-200))">
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">
                      {name.head}
                    </span>
                    <span className="shrink-0 whitespace-pre">{name.tail}</span>
                  </span>
                  <span className="text-code-sm flex min-w-0 text-(--role-text-tertiary,var(--color-rambutan-500))">
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">
                      {folder.head}
                    </span>
                    <span className="max-w-full min-w-0 shrink-0 overflow-hidden text-ellipsis whitespace-pre">
                      {folder.tail}
                    </span>
                  </span>
                </span>
                <span className="text-code-sm shrink-0 text-(--role-text-secondary,var(--color-rambutan-400)) tabular-nums">
                  {size}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
