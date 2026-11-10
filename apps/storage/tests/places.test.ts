import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  NEEDS_ACCESS,
  PLACE_MIN_BYTES,
  type Place,
  type PlacesTable,
  placeFigure,
  placesIn,
  readPlaces,
} from "../native-web/places.ts";
import { PLACES_SHOWN } from "../native-web/side-lists.ts";
import { formatBytes } from "../src/lib/format.ts";

/** A home of the test's own, as the scanner spells it, composed. Pith's own paths come from `URL`, decomposed. */
const home = "/Users/zoë";
const decomposed = "/Users/zoë";
const GB = 1_000_000_000;

function place(
  id: string,
  path: string,
  size: number | null,
  name = id,
): Place {
  return { id, name, path, key: `place/${id}`, size };
}

/** The table native sends for the live map of the startup disk, in the table's order. */
function table(places: Place[]): PlacesTable {
  return { shownAt: ["/", decomposed], places };
}

const photos = place(
  "photos-library",
  `${decomposed}/Pictures/Photos Library.photoslibrary`,
  80 * GB,
  "Photos Library",
);
const mail = place("mail", `${decomposed}/Library/Mail`, null, "Mail");
const messages = place(
  "messages",
  `${decomposed}/Library/Messages`,
  null,
  "Messages",
);
const developer = place(
  "developer",
  `${decomposed}/Library/Developer`,
  25 * GB,
  "Developer",
);
const icloud = place(
  "icloud-drive",
  `${decomposed}/Library/Mobile Documents`,
  3 * GB,
  "iCloud Drive",
);
const downloads = place(
  "downloads",
  `${decomposed}/Downloads`,
  900_000_000,
  "Downloads",
);
const documents = place(
  "documents",
  `${decomposed}/Documents`,
  null,
  "Documents",
);
const applications = place(
  "applications",
  "/Applications",
  48 * GB,
  "Applications",
);
const trash = place("trash", `${decomposed}/.Trash`, 2 * GB, "Trash");
const backups = place(
  "backups",
  `${decomposed}/Library/Application Support/MobileSync/Backup`,
  null,
  "iPhone and iPad backups",
);
const every = [
  photos,
  mail,
  messages,
  developer,
  icloud,
  downloads,
  documents,
  applications,
  trash,
  backups,
];

const ids = (places: readonly Place[]) => places.map((p) => p.id);

describe("where Places shows", () => {
  const sent = table([applications, developer, mail]);

  test("at the startup disk's root and the home folder", () => {
    assert.deepEqual(ids(placesIn(sent, "/")), [
      "applications",
      "developer",
      "mail",
    ]);
    assert.deepEqual(ids(placesIn(sent, home)), ["developer", "mail"]);
  });

  test("nowhere else, though places sit inside", () => {
    for (const folder of [
      "/Users",
      `${home}/Library`,
      `${home}/Library/Developer`,
      "/Applications",
      `${home}Old`,
      "/Users/someone",
    ]) {
      assert.deepEqual(placesIn(sent, folder), [], folder);
    }
  });

  test("nowhere without a table, as on a scan of another folder or disk", () => {
    assert.deepEqual(placesIn(null, "/"), []);
    assert.deepEqual(placesIn(null, home), []);
  });

  test("with each folder in either normalization", () => {
    assert.deepEqual(ids(placesIn(sent, decomposed)), ["developer", "mail"]);
    const composed: PlacesTable = { shownAt: ["/", home], places: [mail] };
    assert.deepEqual(ids(placesIn(composed, decomposed)), ["mail"]);
  });

  test("with only the places inside the open folder", () => {
    // Applications is the Mac's own folder, outside the home folder.
    assert.ok(!ids(placesIn(table(every), home)).includes("applications"));
    assert.ok(ids(placesIn(table(every), "/")).includes("applications"));
  });

  test("not at all when none of its places would show", () => {
    assert.deepEqual(placesIn(table([downloads]), home), []);
    assert.deepEqual(placesIn(table([]), "/"), []);
  });
});

describe("what Places shows", () => {
  test("places of 1 GB or more, largest first, then those Pith can't read, in the table's order", () => {
    assert.deepEqual(
      ids(placesIn(table([mail, photos, documents, trash, developer]), home)),
      ["photos-library", "developer", "trash", "mail", "documents"],
    );
  });

  test("no sized place under 1 GB", () => {
    const under = place("developer", developer.path, PLACE_MIN_BYTES - 1);
    const at = place("trash", trash.path, PLACE_MIN_BYTES);
    assert.deepEqual(ids(placesIn(table([under, at, downloads]), home)), [
      "trash",
    ]);
  });

  test("1 GB as Pith's sizes count it: 10^9 bytes, which reads as 1.00 GB", () => {
    assert.equal(PLACE_MIN_BYTES, 10 ** 9);
    assert.equal(formatBytes(PLACE_MIN_BYTES), "1.00 GB");
  });

  test("an empty place Pith can read is only small, not unreadable", () => {
    const empty = place("messages", messages.path, 0);
    assert.deepEqual(placesIn(table([empty]), home), []);
  });

  test("six places at most, sized ones first", () => {
    assert.equal(PLACES_SHOWN, 6);
    const shown = placesIn(table(every), "/");
    assert.deepEqual(ids(shown), [
      "photos-library",
      "applications",
      "developer",
      "icloud-drive",
      "trash",
      "mail",
    ]);
    // With fewer sized places, the unreadable ones fill the rest in the table's order.
    assert.deepEqual(
      ids(placesIn(table([mail, messages, documents, backups, trash]), home)),
      ["trash", "mail", "messages", "documents", "backups"],
    );
    const unreadable = every.map((p) => ({ ...p, size: null }));
    assert.deepEqual(ids(placesIn(table(unreadable), "/")), [
      "photos-library",
      "mail",
      "messages",
      "developer",
      "icloud-drive",
      "downloads",
    ]);
  });

  test("places of one size in the table's order", () => {
    const one = place("developer", developer.path, 5 * GB);
    const other = place("icloud-drive", icloud.path, 5 * GB);
    assert.deepEqual(ids(placesIn(table([one, other]), home)), [
      "developer",
      "icloud-drive",
    ]);
    assert.deepEqual(ids(placesIn(table([other, one]), home)), [
      "icloud-drive",
      "developer",
    ]);
  });
});

describe("each place's figure", () => {
  test("is its size as the map shows it, to the byte, in the map's own words", () => {
    // Native sends the map's figure for the place's folder; the map labels that folder with formatBytes too.
    for (const size of [
      PLACE_MIN_BYTES,
      25 * GB,
      80_123_456_789,
      999_960_000_000,
    ]) {
      const shown = placesIn(
        table([place("developer", developer.path, size)]),
        home,
      );
      assert.equal(shown[0].size, size);
      assert.equal(placeFigure(shown[0]), formatBytes(size));
    }
  });

  test("says Pith needs Full Disk Access where it can't read the place", () => {
    assert.equal(NEEDS_ACCESS, "Needs Full Disk Access");
    assert.equal(placeFigure(mail), "Needs Full Disk Access");
  });
});

describe("readPlaces", () => {
  const sent = (value: unknown) => JSON.stringify(value);

  test("reads the table as native sends it", () => {
    const read = readPlaces(
      sent({
        shownAt: ["/", decomposed],
        places: [
          {
            id: "developer",
            name: "Developer",
            path: developer.path,
            key: "place/developer",
            size: 25 * GB,
          },
          {
            id: "mail",
            name: "Mail",
            path: mail.path,
            key: "place/mail",
            size: null,
          },
        ],
      }),
    );
    assert.deepEqual(read, table([developer, mail]));
  });

  test("takes a place sent without a size for one Pith can't read", () => {
    const read = readPlaces(
      sent({
        shownAt: ["/"],
        places: [
          { id: "mail", name: "Mail", path: mail.path, key: "place/mail" },
        ],
      }),
    );
    assert.equal(read?.places[0].size, null);
  });

  test("refuses anything else", () => {
    const good = {
      id: "mail",
      name: "Mail",
      path: mail.path,
      key: "place/mail",
      size: null,
    };
    for (const text of [
      null,
      undefined,
      7,
      "",
      "{",
      sent(null),
      sent([]),
      sent({ places: [good] }),
      sent({ shownAt: "/", places: [good] }),
      sent({ shownAt: ["/", 3], places: [good] }),
      sent({ shownAt: ["/"], places: good }),
      sent({ shownAt: ["/"], places: [null] }),
      sent({ shownAt: ["/"], places: [{ ...good, id: 7 }] }),
      sent({ shownAt: ["/"], places: [{ ...good, name: undefined }] }),
      sent({ shownAt: ["/"], places: [{ ...good, path: undefined }] }),
      sent({ shownAt: ["/"], places: [{ ...good, key: null }] }),
      sent({ shownAt: ["/"], places: [{ ...good, size: "1 GB" }] }),
      sent({ shownAt: ["/"], places: [{ ...good, size: -1 }] }),
      sent({ shownAt: ["/"], places: [{ ...good, size: 1.5 }] }),
    ]) {
      assert.equal(readPlaces(text), null, String(text));
    }
  });
});
