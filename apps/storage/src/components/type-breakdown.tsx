import { useMemo } from "react";
import { CATEGORY_LABEL, CATEGORY_VAR, formatBytes } from "~/lib/format";
import { aggregateByCategory } from "~/lib/tree-utils";
import type { TreeNode } from "~/lib/types";

export function TypeBreakdown({ node }: { node: TreeNode }) {
  const rows = useMemo(() => aggregateByCategory(node), [node]);
  const total = rows.reduce((s, r) => s + r.bytes, 0) || 1;

  return (
    <section className="shrink-0 space-y-3">
      <h2 className="font-medium text-[0.6875rem] text-lychee-500 uppercase tracking-wide">
        By type
      </h2>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const pct = (r.bytes / total) * 100;
          return (
            <li key={r.category}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-seed"
                    style={{ background: `var(${CATEGORY_VAR[r.category]})` }}
                  />
                  <span className="truncate text-lychee-200">
                    {CATEGORY_LABEL[r.category]}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-1.5">
                  <span className="font-mono text-lychee-200 text-xs tabular-nums">
                    {formatBytes(r.bytes)}
                  </span>
                  <span className="w-9 text-right text-[0.6875rem] text-lychee-500 tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-orb bg-longan-800">
                <div
                  className="h-full rounded-orb"
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
