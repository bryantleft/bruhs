import type { DirNode } from "./types.ts";

/**
 * Each folder from just below `from` down to `to`, so opening a folder several levels down
 * still leaves a step for every level in the path bar.
 */
export function foldersBetween(from: DirNode, to: DirNode): DirNode[] {
  const trail: DirNode[] = [];
  let folder = from;
  while (folder !== to) {
    const next = folder.children.find(
      (child): child is DirNode =>
        child.kind === "dir" &&
        (child === to || to.path.startsWith(`${child.path}/`)),
    );
    if (!next) {
      throw new Error(
        `${to.path} isn't inside ${from.path}, so it can't be opened from there.`,
      );
    }
    trail.push(next);
    folder = next;
  }
  return trail;
}

/**
 * The open folders, found again in a new scan of the same root, so a rescan (such as the
 * one after Move to Trash) keeps the map where it was. Stops at the first folder that's
 * gone; a scan of another folder starts at its root.
 */
export function retraceFolders(
  root: DirNode,
  paths: readonly string[],
): DirNode[] {
  const trail = [root];
  if (paths[0] !== root.path) return trail;
  for (const path of paths.slice(1)) {
    const next = trail
      .at(-1)
      ?.children.find(
        (child): child is DirNode =>
          child.kind === "dir" && child.path === path,
      );
    if (!next) break;
    trail.push(next);
  }
  return trail;
}
