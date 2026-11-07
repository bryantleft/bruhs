import { kindLabel } from "../src/components/treemap-canvas";
import { CATEGORY_VAR, formatBytes } from "../src/lib/format";
import { KINDS, type Kind, type KindBytes } from "../src/lib/treemap-layout";

interface Props {
  /** The open folder's bytes by kind. */
  bytes: KindBytes;
  /** The kind highlighted on the map, if any. */
  active: Kind | null;
  /** Highlight a kind, or show every kind again when it's already highlighted. */
  onToggle: (kind: Kind) => void;
}

/** Grouped small items and other volumes come last: neither is a kind of file. */
const last = (kind: Kind) =>
  kind === "volume" ? 2 : kind === "grouped" ? 1 : 0;

/**
 * What each colour means and how much of the folder it holds. Each row also highlights
 * its kind on the map. Grouped small items come last: the scan doesn't know their kinds.
 */
export function KindLegend({ bytes, active, onToggle }: Props) {
  const rows = KINDS.filter((kind) => bytes[kind] > 0).sort(
    (a, b) => last(a) - last(b) || bytes[b] - bytes[a],
  );
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="kinds-heading"
      className="flex shrink-0 flex-col gap-2"
    >
      <h2
        id="kinds-heading"
        className="text-eyebrow text-(--role-text-tertiary)"
      >
        By kind
      </h2>
      <ul className="-mx-2 space-y-px">
        {rows.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              aria-pressed={kind === active}
              onClick={() => onToggle(kind)}
              title={
                kind === active
                  ? "Show every kind again"
                  : `Highlight ${kindLabel(kind).toLowerCase()} on the map`
              }
              className="menu-item gap-2 px-2 py-1 aria-pressed:bg-(--role-selection)"
            >
              <span
                aria-hidden="true"
                className={`rounded-seed size-2.5 shrink-0 ${kind === "grouped" ? "hatched" : kind === "volume" ? "border border-dashed border-(--role-text-tertiary) bg-(--role-well)" : ""}`}
                style={
                  kind === "grouped" || kind === "volume"
                    ? undefined
                    : { background: `var(${CATEGORY_VAR[kind]})` }
                }
              />
              <span className="text-label-sm min-w-0 flex-1 truncate">
                {kindLabel(kind)}
              </span>
              <span className="text-code-sm shrink-0 text-(--role-text-secondary) tabular-nums">
                {formatBytes(bytes[kind])}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-label-sm text-pretty text-(--role-text-tertiary)">
        Outlined blocks are folders.
      </p>
    </section>
  );
}
