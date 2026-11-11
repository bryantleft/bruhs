import type { MouseEvent, ReactNode } from "react";
import { rowLabel, selectedRow } from "./map-selection";

/** Text split for CSS truncation: the head gives way first, with an ellipsis, while the tail stays whole. */
interface Split {
  readonly head: string;
  readonly tail: string;
}

interface Props {
  /** Its name, split so its middle gives way and its end, an extension's included, shows (`splitName`). */
  name: Split;
  /** The folder it's in, on a second line, split so the last folder stays whole (`splitFolder`), or none. */
  folder: Split | null;
  /** Its figure where a size goes: a size, or a growth. */
  figure: string;
  /** What VoiceOver hears of it, before it says the item is selected. */
  label: string;
  /** Its path, the row's tooltip. */
  title: string;
  selected: boolean;
  /** The map's pointer is on it, or on a folder holding it. */
  highlighted?: boolean;
  /** What leads the row, an icon or a swatch, decorative. */
  lead: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The pointer or keyboard focus came onto the row, or left it, for linking the map. */
  onHover?: (on: boolean) => void;
}

/**
 * A row of an item in the side lists, as Largest files lists files and Grew since what grew: the item's name over the
 * folder it's in, in a secondary colour, and its figure. A row selects its item; it's no toggle, so it says the item is
 * selected after its name (`selectedRow`, `rowLabel`). Colours use the host's semantic roles when it defines them, as
 * Pith's web view does, and fall back to bruhs's dark tokens.
 */
export function PathRow({
  name,
  folder,
  figure,
  label,
  title,
  selected,
  highlighted = false,
  lead,
  onClick,
  onContextMenu,
  onHover,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      aria-label={rowLabel(label, selected)}
      {...selectedRow(selected)}
      data-highlighted={highlighted ? "" : undefined}
      title={title}
      className="menu-item items-start gap-2 px-2 py-1 data-selected:bg-(--role-selection,var(--color-persimmon-950))"
    >
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-code-sm flex min-w-0 text-(--role-text,var(--color-rambutan-200))">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">
            {name.head}
          </span>
          <span className="shrink-0 whitespace-pre">{name.tail}</span>
        </span>
        {folder && (
          <span className="text-code-sm flex min-w-0 text-(--role-text-tertiary,var(--color-rambutan-500))">
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">
              {folder.head}
            </span>
            <span className="max-w-full min-w-0 shrink-0 overflow-hidden text-ellipsis whitespace-pre">
              {folder.tail}
            </span>
          </span>
        )}
      </span>
      <span className="text-code-sm shrink-0 text-(--role-text-secondary,var(--color-rambutan-400)) tabular-nums">
        {figure}
      </span>
    </button>
  );
}
