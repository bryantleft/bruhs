import { useMemo } from "react";
import { CATEGORY_LABEL, CATEGORY_VAR, formatBytes } from "~/lib/format";
import { aggregateByCategory } from "~/lib/tree-utils";
import type { TreeNode } from "~/lib/types";

export function TypeBreakdown({ node }: { node: TreeNode }) {
  const rows = useMemo(() => aggregateByCategory(node), [node]);
  const total = rows.reduce((s, r) => s + r.bytes, 0) || 1;

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-lychee-300 text-xs uppercase tracking-wide">
        By type
      </h3>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const pct = (r.bytes / total) * 100;
          return (
            <div key={r.category} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-lychee-200">
                  <span
                    className="inline-block size-2.5 rounded-sm"
                    style={{ background: `var(${CATEGORY_VAR[r.category]})` }}
                  />
                  {CATEGORY_LABEL[r.category]}
                </span>
                <span className="font-mono text-lychee-400">
                  {formatBytes(r.bytes)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-longan-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: `var(${CATEGORY_VAR[r.category]})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
