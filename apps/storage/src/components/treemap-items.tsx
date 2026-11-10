import { memo } from "react";
import { formatBytes } from "~/lib/format";
import { NOT_MEASURED } from "~/lib/treemap-layout";
import type { DirNode, TreeNode } from "~/lib/types";

interface TreemapItemsProps {
  /** The directory the map shows, whose items the list names. */
  root: DirNode;
  selectedPath: string | null;
  /** Selects an item, as a click on its block does. */
  onSelect: (node: TreeNode | null) => void;
  /** Opens a child folder of `root`. */
  onEnterDir: (node: DirNode) => void;
  /** The item under VoiceOver or keyboard focus, which the map outlines, or null for none. */
  onFocusItem: (path: string | null) => void;
  /** The bytes of the map's Not measured block, which the list names last, or nothing without one. */
  unmeasured?: number;
  /** The Not measured block's row was chosen: show what it holds and why. */
  onUnmeasured?: () => void;
}

/** A folder the user can zoom into. */
function isOpenable(node: TreeNode, root: DirNode): node is DirNode {
  return (
    node.kind === "dir" && node.children.length > 0 && node.path !== root.path
  );
}

/**
 * A screen reader can't read the canvas, so the current folder's items are also listed as
 * buttons, including the ones too small to draw and the folders the scan couldn't read,
 * and then the Not measured block, which explains itself. The list stays out of the tab
 * order, since the map itself is the one tab stop; VoiceOver still reaches every button,
 * and the item it's on is outlined on the map.
 */
export const TreemapItems = memo(function TreemapItems({
  root,
  selectedPath,
  onSelect,
  onEnterDir,
  onFocusItem,
  unmeasured,
  onUnmeasured,
}: TreemapItemsProps) {
  return (
    <ul
      aria-label={`Items in ${root.name || root.path}`}
      className="surface-floating focus-within:z-popover sr-only max-h-[calc(100%-1rem)] overflow-y-auto p-2 focus-within:not-sr-only focus-within:absolute focus-within:top-2 focus-within:left-2 focus-within:w-80"
      onBlur={() => onFocusItem(null)}
    >
      {root.children.map((child) => (
        <li key={child.path} className="flex items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={child.path === selectedPath}
            disabled={child.kind === "unreadable" || child.kind === "volume"}
            onClick={() => onSelect(child)}
            onFocus={() =>
              onFocusItem(child.kind === "aggregate" ? null : child.path)
            }
            className="menu-item block min-w-0 flex-1 truncate px-2 py-1"
          >
            {child.name}{" "}
            <span className="text-code-sm text-(--role-text-secondary,var(--color-rambutan-400)) tabular-nums">
              {child.kind === "unreadable"
                ? "couldn’t be read"
                : child.kind === "volume"
                  ? `${formatBytes(child.size)}, another volume`
                  : formatBytes(child.size)}
            </span>
          </button>
          {isOpenable(child, root) && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onEnterDir(child)}
              onFocus={() => onFocusItem(child.path)}
              aria-label={`Open ${child.name}`}
              className="menu-item w-auto shrink-0 px-2 py-1"
            >
              Open
            </button>
          )}
        </li>
      ))}
      {unmeasured !== undefined && unmeasured > 0 && (
        <li className="flex items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            disabled={!onUnmeasured}
            onClick={onUnmeasured}
            onFocus={() => onFocusItem(null)}
            className="menu-item block min-w-0 flex-1 truncate px-2 py-1"
          >
            {NOT_MEASURED}{" "}
            <span className="text-code-sm text-(--role-text-secondary,var(--color-rambutan-400)) tabular-nums">
              {formatBytes(unmeasured)}
            </span>
          </button>
        </li>
      )}
    </ul>
  );
});
