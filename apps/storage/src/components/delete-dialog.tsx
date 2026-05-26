import { Loader2, Trash2, TriangleAlert } from "lucide-react";
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
        className="absolute inset-0 cursor-default bg-longan-950/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-mango bg-longan-900 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-grape bg-lychee-500/15 text-lychee-300">
            <TriangleAlert className="size-4 shrink-0" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-base text-lychee-50 tracking-tight">
              Move to Trash?
            </h2>

            {aggregate ? (
              <p className="mt-2 text-pretty text-lychee-300 text-sm">
                This is an aggregate of many small items, not a single file.
                Zoom in to select a real file or folder to delete.
              </p>
            ) : (
              <>
                <p
                  className="mt-2 truncate font-medium font-mono text-lychee-100 text-sm"
                  title={target.name}
                >
                  {target.name}
                </p>
                <p className="mt-0.5 break-all text-[0.6875rem] text-lychee-500 leading-4">
                  {target.path}
                </p>
                <p className="mt-3 text-pretty text-lychee-300 text-sm">
                  Frees{" "}
                  <span className="font-medium font-mono text-persimmon-300 tabular-nums">
                    {formatBytes(target.size)}
                  </span>
                  . It goes to the macOS Trash and can be restored with Put
                  Back.
                </p>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-grape bg-lychee-500/10 px-3 py-2 text-lychee-200 text-sm ring-1 ring-lychee-500/20 ring-inset">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-grape bg-longan-800 px-3 py-2 font-medium text-lychee-200 text-sm ring-1 ring-longan-700 ring-inset hover:bg-longan-700 focus-visible:outline-2 focus-visible:outline-lychee-400 focus-visible:outline-offset-2"
          >
            Cancel
          </button>
          {!aggregate && (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-grape bg-lychee-600 py-2 pr-3 pl-2 font-medium text-sm text-white hover:bg-lychee-500 focus-visible:outline-2 focus-visible:outline-lychee-400 focus-visible:outline-offset-2 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Trash2 className="size-4 shrink-0" />
              )}
              Move to Trash
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
