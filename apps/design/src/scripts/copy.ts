/**
 * Click-to-copy for any element with `data-copy="<text>"`. One delegated listener for the
 * whole site, so the colour and type pages need no framework island. The module runs once;
 * the listener survives Astro view transitions because it lives on `document`.
 */

const COPIED_MS = 1500;

function announce(message: string): void {
  const status = document.getElementById("copy-status");
  if (status) status.textContent = message;
}

document.addEventListener("click", async (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-copy]")
      : null;
  const text = target?.dataset.copy;
  if (!target || text === undefined) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    announce("Copy failed");
    return;
  }
  target.dataset.copied = "";
  announce(`Copied ${text}`);
  setTimeout(() => {
    delete target.dataset.copied;
  }, COPIED_MS);
});
