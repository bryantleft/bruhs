import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  archiveURL,
  compareVersions,
  feed,
  feedItem,
  feedItems,
  paragraphs,
  releases,
} from "../scripts/pith-release.mjs";

const changelog = `# Pith releases

Each version's notes show in Pith's update window.

## 0.2.0

Disk shows what grew
since the last scan.

Activity remembers its columns.

## 0.1.0

The first release.
`;

describe("releases", () => {
  test("reads each version's notes, newest first", () => {
    assert.deepEqual(releases(changelog), [
      {
        version: "0.2.0",
        notes: [
          "Disk shows what grew since the last scan.",
          "Activity remembers its columns.",
        ],
      },
      { version: "0.1.0", notes: ["The first release."] },
    ]);
  });

  test("refuses notes Pith's update window shouldn't show", () => {
    assert.throws(
      () => releases("## 0.1.0\n\nFaster — and smaller.\n"),
      /keeps out/,
    );
    assert.throws(() => releases("## 0.1.0\n\n- Faster scans\n"), /list item/);
    assert.throws(() => releases("## 0.1.0\n\nA ]]> here.\n"), /end the feed/);
    assert.throws(() => releases("## 0.1.0\n\n"), /no release notes/);
    assert.throws(() => releases("# Nothing here\n"), /no "## 1.2.3"/);
  });

  test("insists on the newest version first", () => {
    assert.throws(
      () => releases("## 0.1.0\n\nOld.\n\n## 0.2.0\n\nNew.\n"),
      /newest version first/,
    );
    assert.throws(
      () => releases("## 0.1.0\n\nOne.\n\n## 0.1.0\n\nAgain.\n"),
      /newest version first/,
    );
  });
});

describe("compareVersions", () => {
  test("compares each part as a number", () => {
    assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
    assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  });
});

describe("paragraphs", () => {
  test("splits at blank lines and joins wrapped lines", () => {
    assert.deepEqual(paragraphs(["a", " b ", "", "", "c", ""]), ["a b", "c"]);
  });
});

describe("feed", () => {
  const item = feedItem({
    version: "0.2.0",
    notes: ["Disk shows what grew.", "Activity remembers its columns."],
    date: new Date(Date.UTC(2026, 10, 8, 17, 30)),
    url: archiveURL("0.2.0"),
    length: 5185544,
    signature: "c2lnbmF0dXJl",
  });

  test("describes a version as Sparkle reads it", () => {
    assert.match(item, /<sparkle:version>0\.2\.0<\/sparkle:version>/);
    assert.match(item, /<pubDate>Sun, 08 Nov 2026 17:30:00 \+0000<\/pubDate>/);
    assert.match(
      item,
      /<description sparkle:format="plain-text"><!\[CDATA\[Disk shows what grew\.\n\nActivity remembers its columns\.\]\]><\/description>/,
    );
    assert.match(
      item,
      /url="https:\/\/github\.com\/bryantleft\/bruhs\/releases\/download\/pith-v0\.2\.0\/Pith-0\.2\.0\.zip" length="5185544"/,
    );
    assert.match(item, /sparkle:edSignature="c2lnbmF0dXJl"/);
  });

  test("reads back the items it wrote, so a new version goes on top", () => {
    const older = item.replaceAll("0.2.0", "0.1.0");
    const xml = feed([item, older]);
    assert.deepEqual(
      feedItems(xml).map((entry) => entry.version),
      ["0.2.0", "0.1.0"],
    );
    assert.equal(feedItems(xml)[1].xml, older);
    // A feed sign_update signed ends in a comment; the items read the same.
    const signed = `${xml}<!-- sparkle-signatures:\nedSignature: abc\nlength: 10\n-->\n`;
    assert.equal(feedItems(signed).length, 2);
  });

  test("reads a feed as sign_update rewrites it when signing", () => {
    // Sparkle 2.10.1's sign_update serializes the XML again: a standalone declaration, its warning comment, and the
    // enclosure as an open and close tag. The next release reads the published feed back in this form.
    const resigned = `<?xml version="1.0" encoding="utf-8" standalone="yes"?><!-- sparkle-sign-warning:
IMPORTANT: This file was signed by Sparkle.
--><rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
  <channel>
    <title>Pith</title>
    <item>
      <title>Pith 0.1.0</title>
      <sparkle:version>0.1.0</sparkle:version>
      <enclosure url="${archiveURL("0.1.0")}" length="6275849" type="application/octet-stream" sparkle:edSignature="c2ln"></enclosure>
    </item>
  </channel>
</rss><!-- sparkle-signatures:
edSignature: abc
length: 10
-->
`;
    const [entry] = feedItems(resigned);
    assert.equal(entry.version, "0.1.0");
    assert.match(entry.xml, /<\/enclosure>\n {4}<\/item>$/);
    assert.deepEqual(
      feedItems(feed([item, entry.xml])).map((read) => read.version),
      ["0.2.0", "0.1.0"],
    );
  });
});
