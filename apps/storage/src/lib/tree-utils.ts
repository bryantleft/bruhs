import { type Category, categoryForName } from "./format";
import type { TreeNode } from "./types";

/** Sum visible leaf sizes by file-type category, descending. */
export function aggregateByCategory(
  node: TreeNode,
): { category: Category; bytes: number }[] {
  const totals = new Map<Category, number>();
  const visit = (n: TreeNode) => {
    if (n.children?.length) {
      for (const c of n.children) visit(c);
    } else {
      const cat: Category = n.name.startsWith("(")
        ? "other"
        : categoryForName(n.name);
      totals.set(cat, (totals.get(cat) ?? 0) + n.size);
    }
  };
  visit(node);
  return [...totals.entries()]
    .map(([category, bytes]) => ({ category, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Return a copy of the tree with the node at `path` removed and ancestor sizes
 * decremented. Used for optimistic UI updates after a file is trashed.
 */
export function removeByPath(
  node: TreeNode,
  path: string,
): { node: TreeNode; removed: number } {
  if (!node.children || node.children.length === 0) return { node, removed: 0 };
  let removed = 0;
  const children: TreeNode[] = [];
  for (const child of node.children) {
    if (child.path === path) {
      removed += child.size;
      continue;
    }
    const res = removeByPath(child, path);
    removed += res.removed;
    children.push(res.node);
  }
  return { node: { ...node, size: node.size - removed, children }, removed };
}

/** Find a node by path anywhere in the tree. */
export function findByPath(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  if (!node.children) return null;
  for (const c of node.children) {
    const found = findByPath(c, path);
    if (found) return found;
  }
  return null;
}
