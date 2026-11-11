/**
 * How file names and folders are shortened for display. Lengths count graphemes, not code
 * units: macOS often stores accented names decomposed ("e" + U+0301), and cutting between
 * the two would leave a stray accent.
 */

const ELLIPSIS = "…";
const segmenter = new Intl.Segmenter();

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/**
 * The extension with its dot, as graphemes, or none. A leading dot marks a hidden file
 * rather than an extension, and anything longer than ".sparsebundle" is part of the name.
 */
function extensionOf(chars: readonly string[]): readonly string[] {
  const dot = chars.lastIndexOf(".");
  if (dot <= 0) return [];
  const length = chars.length - dot - 1;
  return length >= 1 && length <= 12 ? chars.slice(dot) : [];
}

/**
 * Fit `text` in `maxChars` by cutting its middle, so the start and the end (with the whole
 * extension) stay readable: "before-app-review-screenshot.png" → "before-a…hot.png".
 */
export function middleTruncate(text: string, maxChars: number): string {
  const chars = graphemes(text);
  if (chars.length <= maxChars) return text;
  if (maxChars <= 0) return "";
  const budget = maxChars - 1;
  const extension = extensionOf(chars);
  if (extension.length > budget - 1) return endTruncate(text, maxChars);
  const tail = Math.max(extension.length, Math.floor(budget / 2));
  const head = chars
    .slice(0, budget - tail)
    .join("")
    .trimEnd();
  return `${head}${ELLIPSIS}${chars.slice(chars.length - tail).join("")}`;
}

/** Fit `text` in `maxChars` by cutting its end: "@biomejs+cli-darwin-arm64" → "@biomejs+c…". */
export function endTruncate(text: string, maxChars: number): string {
  const chars = graphemes(text);
  if (chars.length <= maxChars) return text;
  if (maxChars <= 0) return "";
  return (
    chars
      .slice(0, maxChars - 1)
      .join("")
      .trimEnd() + ELLIPSIS
  );
}

/** Length in graphemes, the unit the truncation functions count. */
export function graphemeLength(text: string): number {
  return graphemes(text).length;
}

/**
 * Split a name for CSS middle truncation: the head shrinks with an ellipsis while the tail,
 * the extension plus a few characters before it, always shows.
 */
export function splitName(name: string): { head: string; tail: string } {
  const chars = graphemes(name);
  const extension = extensionOf(chars);
  // Three characters before the extension tell "shot-1.png" from "shot-2.png".
  const tail = extension.length > 0 ? extension.length + 3 : 4;
  if (chars.length <= tail + 2) return { head: name, tail: "" };
  return {
    head: chars.slice(0, chars.length - tail).join(""),
    tail: chars.slice(chars.length - tail).join(""),
  };
}

/** The folder holding `path`, whole. */
export function parentFolder(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

/**
 * The folder holding `path` from below `base` on, for a list of what's inside `base`, a folder whose own name a path bar
 * shows already: none for an item right in `base`, and the whole folder for one outside it.
 */
export function folderBelow(path: string, base: string): string | null {
  const folder = parentFolder(path);
  if (folder === base) return null;
  const prefix = base === "/" ? "/" : `${base}/`;
  return folder.startsWith(prefix) ? folder.slice(prefix.length) : folder;
}

/** Split a folder path so its last folder stays whole when the rest is cut. */
export function splitFolder(folder: string): { head: string; tail: string } {
  const cut = folder.lastIndexOf("/");
  if (cut < 0 || folder === "/") return { head: "", tail: folder };
  return { head: folder.slice(0, cut + 1), tail: folder.slice(cut + 1) };
}
