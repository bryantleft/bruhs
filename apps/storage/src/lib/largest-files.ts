import type { DirNode, FileEntry } from "./types.ts";

/**
 * As many rows as the scanner's own list (TOP_FILES_GLOBAL in scanner/src/walk.rs), so the
 * scan's top folder shows exactly what the scanner reported.
 */
export const LARGEST_FILES_SHOWN = 200;

/**
 * The largest files inside `folder`, largest first. The scan's overall list knows files its
 * tree folded into "(smaller items)"; the tree knows files below the overall top 200.
 */
export function largestFilesIn(
  folder: DirNode,
  topFiles: readonly FileEntry[],
  limit: number,
): FileEntry[] {
  const prefix = folder.path === "/" ? "/" : `${folder.path}/`;
  const byPath = new Map<string, FileEntry>();
  for (const file of topFiles) {
    if (file.path.startsWith(prefix)) byPath.set(file.path, file);
  }
  const visit = (dir: DirNode) => {
    for (const child of dir.children) {
      if (child.kind === "dir") visit(child);
      else if (child.kind === "file" && !byPath.has(child.path)) {
        byPath.set(child.path, {
          name: child.name,
          path: child.path,
          size: child.size,
        });
      }
    }
  };
  visit(folder);
  return [...byPath.values()]
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, limit);
}
