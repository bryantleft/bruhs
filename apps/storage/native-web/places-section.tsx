import { useEffect, useState } from "react";
import { MapIcon, type PageIcons } from "./map-icon";
import {
  type Place,
  type PlacesTable,
  placeFigure,
  readPlaces,
} from "./places";

declare global {
  interface Window {
    /**
     * The Places section's table, as JSON (`PlacesTable` in KnownPlaces.swift), or null for a map of anything but the
     * startup disk's live one. Pith sends it with a map, once the page is ready and whenever it changes.
     */
    pithReceivePlaces: (table: string | null) => void;
  }
}

/** The Places section's table as Pith last sent it: null until then, and with a scan, which shows no Places. */
export function usePlaces(): PlacesTable | null {
  const [table, setTable] = useState<PlacesTable | null>(null);
  useEffect(() => {
    window.pithReceivePlaces = (text) => setTable(readPlaces(text));
    return () => {
      window.pithReceivePlaces = () => {};
    };
  }, []);
  return table;
}

/**
 * Places, which opens the side column at the startup disk's root and the home folder (`placesIn`): each place with its
 * own icon, and its size or why Pith can't read it. A click opens the place's folder, as a folder's row opens it in the
 * map's list of items. A place Pith can't read opens Full Disk Access in System Settings instead (`onNeedsAccess`),
 * which would let Pith read it, as the notices' Full Disk Access… buttons do. A place macOS is still asking the person
 * about waits for their answer, which is enough, as the asking notice says: its row only says so, and isn't a button.
 */
export function Places({
  places,
  icons,
  onOpen,
  onNeedsAccess,
}: {
  places: readonly Place[];
  icons: PageIcons | null;
  onOpen: (path: string) => void;
  onNeedsAccess: () => void;
}) {
  return (
    <section
      aria-labelledby="places-heading"
      className="flex shrink-0 flex-col gap-1.5"
    >
      <h2
        id="places-heading"
        className="text-eyebrow text-(--role-text-tertiary)"
      >
        Places
      </h2>
      <ul className="-mx-2 space-y-px">
        {places.map((place) => {
          const row = (
            <>
              {icons && <MapIcon url={icons.key(place.key)} />}
              <span className="text-body-sm min-w-0 flex-1 truncate text-(--role-text)">
                {place.name}
              </span>
              {place.size === null ? (
                <span className="text-label-sm shrink-0 text-(--role-text-tertiary)">
                  {placeFigure(place)}
                </span>
              ) : (
                <span className="text-code-sm shrink-0 text-(--role-text-secondary) tabular-nums">
                  {placeFigure(place)}
                </span>
              )}
            </>
          );
          return (
            <li key={place.id}>
              {place.asking ? (
                <div
                  title={place.path}
                  className="flex items-center gap-2 px-2 py-1"
                >
                  {row}
                </div>
              ) : (
                <button
                  type="button"
                  title={place.path}
                  onClick={() =>
                    place.size === null ? onNeedsAccess() : onOpen(place.path)
                  }
                  className="menu-item gap-2 px-2 py-1"
                >
                  {row}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
