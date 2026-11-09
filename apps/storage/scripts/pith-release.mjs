/**
 * Pith's releases: each version and its notes from native/CHANGELOG.md, and the Sparkle feed that offers them to
 * installed copies. The build stamps the newest version and the update settings into Info.plist; publishing writes the
 * feed. Pith's update window shows the notes, so they follow its writing rules.
 */
import { readFileSync } from "node:fs";

export const REPOSITORY = "bryantleft/bruhs";
/**
 * The feed lives in a release of its own, so its address never moves with the repository's latest release, which
 * another app's release could take over.
 */
export const FEED_TAG = "pith-updates";
export const FEED_URL = `https://github.com/${REPOSITORY}/releases/download/${FEED_TAG}/appcast.xml`;
/** Sparkle checks every update against this key. Its private half is in the publisher's login keychain, account `pith`. */
export const PUBLIC_KEY = "cEb9bH9UAXS4n/hN3EH1/uxBE5vVIq0UzGaUCYII5JQ=";
export const KEY_ACCOUNT = "pith";
/** LSMinimumSystemVersion, in the three-part form Sparkle compares. */
export const MINIMUM_SYSTEM = "14.0.0";

export const releaseTag = (version) => `pith-v${version}`;
export const archiveName = (version) => `Pith-${version}.zip`;
export const archiveURL = (version) => `https://github.com/${REPOSITORY}/releases/download/${releaseTag(version)}/${archiveName(version)}`;
export const releasePage = (version) => `https://github.com/${REPOSITORY}/releases/tag/${releaseTag(version)}`;

/** The separator characters Pith's interface keeps out (scripts/lint-native.mjs). */
const SEPARATORS = /[•·—–‒―‧∙]/;

/** Paragraphs split at blank lines, each with its wrapped lines joined, as Pith's update window shows them. */
export function paragraphs(lines) {
  const result = [];
  let current = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) current.push(trimmed);
    else if (current.length) {
      result.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) result.push(current.join(" "));
  return result;
}

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b`, both "major.minor.patch". */
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/**
 * Each version's notes, newest first, from a changelog of `## 1.2.3` sections. Throws, saying what to fix, when a
 * version is out of order or its notes are empty, use a bullet or dash, or would break the feed.
 */
export function releases(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = /^## (\d+\.\d+\.\d+)\s*$/.exec(line);
    if (heading) {
      current = { version: heading[1], lines: [] };
      sections.push(current);
    } else if (line.startsWith("#")) {
      current = null;
    } else {
      current?.lines.push(line);
    }
  }
  if (!sections.length) throw new Error('The changelog has no "## 1.2.3" version sections, so Pith has no version.');
  const result = sections.map(({ version, lines }) => ({ version, notes: paragraphs(lines) }));
  result.forEach(({ version, notes }, i) => {
    if (!notes.length) throw new Error(`Pith ${version} has no release notes in the changelog. The update window shows them.`);
    for (const note of notes) {
      const separator = SEPARATORS.exec(note);
      if (separator) throw new Error(`Pith ${version}'s notes use "${separator[0]}", which Pith's interface keeps out: write sentences instead.`);
      if (/^[-*+] |^\d+\. /.test(note)) throw new Error(`Pith ${version}'s notes have a list item ("${note.slice(0, 20)}…"). Write sentences instead.`);
      if (note.includes("]]>")) throw new Error(`Pith ${version}'s notes contain "]]>", which would end the feed's text early.`);
    }
    const older = result[i + 1];
    if (older && compareVersions(version, older.version) <= 0) {
      throw new Error(`The changelog lists ${version} above ${older.version}. Put the newest version first.`);
    }
  });
  return result;
}

/** The newest version in a changelog file, which is the version the build stamps. */
export function currentRelease(changelog) {
  return releases(readFileSync(changelog, "utf8"))[0];
}

/** RFC 822, as RSS dates are. */
const rssDate = (date) => date.toUTCString().replace("GMT", "+0000");

/** One version in the feed, its notes embedded as plain text so they need no signing of their own. */
export function feedItem({ version, notes, date, url, length, signature, page = releasePage(version) }) {
  return [
    "    <item>",
    `      <title>Pith ${version}</title>`,
    `      <link>${page}</link>`,
    `      <sparkle:version>${version}</sparkle:version>`,
    `      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>`,
    `      <sparkle:minimumSystemVersion>${MINIMUM_SYSTEM}</sparkle:minimumSystemVersion>`,
    `      <pubDate>${rssDate(date)}</pubDate>`,
    `      <description sparkle:format="plain-text"><![CDATA[${notes.join("\n\n")}]]></description>`,
    `      <enclosure url="${url}" length="${length}" type="application/octet-stream" sparkle:edSignature="${signature}"/>`,
    "    </item>",
  ].join("\n");
}

/** The whole feed, newest version first. It's unsigned: Sparkle's sign_update signs it in place. */
export function feed(items) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">',
    "  <channel>",
    "    <title>Pith</title>",
    `    <link>https://github.com/${REPOSITORY}/releases</link>`,
    "    <description>Versions of Pith, newest first.</description>",
    "    <language>en</language>",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** The items of a feed `feed` wrote, each with its version, so a new version can go on top of them. */
export function feedItems(xml) {
  return [...xml.matchAll(/^ {4}<item>\n[\s\S]*?^ {4}<\/item>$/gm)].map(([item]) => {
    const version = /<sparkle:version>([^<]+)<\/sparkle:version>/.exec(item)?.[1];
    if (!version) throw new Error(`A feed item has no sparkle:version:\n${item}`);
    return { version, xml: item };
  });
}
