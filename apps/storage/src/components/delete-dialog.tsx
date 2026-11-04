import { Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatBytes } from "~/lib/format";
import { parseTrashResult } from "~/lib/protocol";
import type { TrashFailure, TreeNode } from "~/lib/types";

interface Props {
  /** A real file or folder (the caller never passes an aggregate node). */
  target: TreeNode;
  onClose: () => void;
  onTrashed: (path: string) => void;
}

const FAILURE_MESSAGE: Partial<Record<TrashFailure, string>> = {
  cross_origin: "The request was refused because it came from another site.",
  not_found: "It's already gone: nothing exists at this path any more.",
  no_scan: "Run a scan first, then try again.",
  outside_scan_root: "Only items inside the scanned folder can be trashed.",
  protected_path:
    "Top-level folders and your home folder can't be moved to the Trash.",
  aggregate: "This groups many small items; zoom in to pick one.",
  scanner_failed: "The scanner couldn't move it to the Trash.",
};

/**
 * Confirmation modal that moves a file/folder to the macOS Trash (reversible).
 *
 * Built on a native `<dialog>` opened with `showModal()`: the browser traps focus,
 * makes the page behind it inert, closes it on Escape and returns focus to the
 * control that opened it.
 */
export function DeleteDialog({ target, onClose, onTrashed }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Imperative DOM sync: a dialog only becomes modal through `showModal()`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Close through the element so the browser restores focus, then let the parent unmount.
  const close = () => dialogRef.current?.close();

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target.path }),
      });
      const data = parseTrashResult(await res.json());
      if (data?.ok) {
        onTrashed(target.path);
        close();
      } else {
        const reason = data?.reason;
        setError(
          (reason && FAILURE_MESSAGE[reason]) ??
            reason ??
            `Failed to move to Trash (HTTP ${res.status})`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move to Trash");
    } finally {
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop clicks are a mouse shortcut; keyboards close it with Escape or Cancel.
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) hit the backdrop.
        if (e.target === e.currentTarget) close();
      }}
      // No padding on the dialog itself: clicks on it count as backdrop clicks above.
      className="dialog max-w-md p-0"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-grape bg-lychee-500/15 text-lychee-300 flex size-9 shrink-0 items-center justify-center">
            <TriangleAlert className="size-4 shrink-0" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-h4 text-rambutan-50 text-balance">
              Move to Trash?
            </h2>
            <p
              className="text-code text-rambutan-100 mt-2 truncate"
              title={target.name}
            >
              {target.name}
            </p>
            <p className="text-code-sm text-rambutan-500 mt-0.5 break-all">
              {target.path}
            </p>
            <p className="text-body-sm text-rambutan-300 mt-3 text-pretty">
              Frees{" "}
              <span className="text-persimmon-300 font-medium tabular-nums">
                {formatBytes(target.size)}
              </span>
              . It goes to the macOS Trash and can be restored with Put Back.
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="text-body-sm rounded-grape bg-lychee-500/10 text-lychee-200 ring-lychee-500/20 mt-4 px-3 py-2 ring-1 ring-inset"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            // biome-ignore lint/a11y/noAutofocus: safest default for a destructive dialog.
            autoFocus
            className="btn btn-outline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="btn btn-danger pl-2"
          >
            {busy ? (
              <span aria-hidden="true" className="spinner size-4" />
            ) : (
              <Trash2 className="size-4 shrink-0" />
            )}
            Move to Trash
          </button>
        </div>
      </div>
    </dialog>
  );
}
