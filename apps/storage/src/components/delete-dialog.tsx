import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatBytes } from "~/lib/format";
import type { TrashResult, TreeNode } from "~/lib/types";

interface Props {
  target: TreeNode;
  onClose: () => void;
  onTrashed: (path: string) => void;
}

/** Confirmation modal that moves a file/folder to the macOS Trash (reversible). */
export function DeleteDialog({ target, onClose, onTrashed }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aggregate = target.name.startsWith("(");

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = async () => {
    if (aggregate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target.path }),
      });
      const data = (await res.json()) as TrashResult;
      if (data.ok) {
        onTrashed(target.path);
        onClose();
      } else {
        setError(data.reason ?? "Failed to move to Trash");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move to Trash");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop: a real button so it's keyboard-dismissable. */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-longan-700 bg-longan-900 p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-lychee-200">
          <span className="flex size-8 items-center justify-center rounded-full bg-lychee-900 text-lychee-400">
            <AlertTriangle size={16} />
          </span>
          <h2 className="font-semibold text-lg">Move to Trash?</h2>
        </div>

        {aggregate ? (
          <p className="text-lychee-300 text-sm">
            This is an aggregate of many small items, not a single file. Zoom in
            to select a real file or folder to delete.
          </p>
        ) : (
          <>
            <p className="mb-1 truncate font-mono text-lychee-100 text-sm">
              {target.name}
            </p>
            <p className="mb-3 break-all text-lychee-500 text-xs">
              {target.path}
            </p>
            <p className="text-lychee-300 text-sm">
              Frees{" "}
              <span className="font-medium text-persimmon-300">
                {formatBytes(target.size)}
              </span>
              . The item goes to the macOS Trash and can be restored with Put
              Back.
            </p>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-lychee-900/40 px-3 py-2 text-lychee-300 text-sm">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-lychee-300 text-sm transition hover:bg-longan-800"
          >
            Cancel
          </button>
          {!aggregate && (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-lychee-600 px-4 py-2 font-medium text-sm text-white transition hover:bg-lychee-500 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Trash2 size={15} />
              )}
              Move to Trash
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
