import { useMemo } from "react";
import { CATEGORY_LABEL, CATEGORY_VAR, formatBytes } from "~/lib/format";
import { aggregateByCategory } from "~/lib/tree-utils";
import type { TreeNode } from "~/lib/types";

export function TypeBreakdown({ node }: { node: TreeNode }) {
  const rows = useMemo(() => aggregateByCategory(node), [node]);
  const total = rows.reduce((s, r) => s + r.bytes, 0) || 1;

  return (
    <section className="shrink-0 space-y-3">
      <h2 className="text-eyebrow text-rambutan-500">By type</h2>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const pct = (r.bytes / total) * 100;
          return (
            <li key={r.category}>
              <div className="text-body-sm flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="rounded-seed size-2.5 shrink-0"
                    style={{ background: `var(${CATEGORY_VAR[r.category]})` }}
                  />
                  <span className="text-rambutan-200 truncate">
                    {CATEGORY_LABEL[r.category]}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-code-sm text-rambutan-200 tabular-nums">
                    {formatBytes(r.bytes)}
                  </span>
                  <span className="text-code-sm text-rambutan-500 w-9 text-right tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="rounded-orb bg-longan-800 mt-1.5 h-1.5 overflow-hidden">
                <div
                  className="rounded-orb h-full"
                  style={{
                    width: `${pct}%`,
                    background: `var(${CATEGORY_VAR[r.category]})`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
