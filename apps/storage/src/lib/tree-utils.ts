import { type Category, categoryForName } from "./format";
import type { DirNode, TreeNode } from "./types";

/** The scanner's synthetic "(smaller items)" node, which can't be trashed. */
export function isAggregate(node: TreeNode): boolean {
  return node.kind === "aggregate";
}

/** The colour category of a node: aggregates and folders count as "other". */
export function categoryForNode(node: TreeNode): Category {
  return node.kind === "file" ? categoryForName(node.name) : "other";
}

/** Sum visible leaf sizes by file-type category, descending. */
export function aggregateByCategory(
  node: TreeNode,
): { category: Category; bytes: number }[] {
  const totals = new Map<Category, number>();
  const visit = (n: TreeNode) => {
    if (n.kind === "dir" && n.children.length > 0) {
      for (const c of n.children) visit(c);
      return;
    }
    const cat = categoryForNode(n);
    totals.set(cat, (totals.get(cat) ?? 0) + n.size);
  };
  visit(node);
  return [...totals.entries()]
    .map(([category, bytes]) => ({ category, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Return a copy of the tree without the nodes at `paths`, with ancestor sizes
 * decremented. Used to hide items the user has moved to the Trash.
 */
export function removePaths(
  node: DirNode,
  paths: ReadonlySet<string>,
): DirNode {
  if (paths.size === 0) return node;
  return removeFrom(node, paths).node;
}

function removeFrom(
  node: DirNode,
  paths: ReadonlySet<string>,
): { node: DirNode; removed: number } {
  let removed = 0;
  const children: TreeNode[] = [];
  for (const child of node.children) {
    if (paths.has(child.path)) {
      removed += child.size;
    } else if (child.kind === "dir") {
      const res = removeFrom(child, paths);
      removed += res.removed;
      children.push(res.node);
    } else {
      children.push(child);
    }
  }
  if (removed === 0) return { node, removed };
  return { node: { ...node, size: node.size - removed, children }, removed };
}

/** Find a node by path anywhere in the tree. */
export function findByPath(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  if (node.kind !== "dir") return null;
  for (const c of node.children) {
    const found = findByPath(c, path);
    if (found) return found;
  }
  return null;
}
