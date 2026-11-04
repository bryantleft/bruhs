export function MessageError({ error }: { error: string }) {
  return (
    <div className="flex h-4 items-center justify-start">
      <div role="alert" className="flex items-center justify-center gap-x-1">
        <span
          aria-hidden="true"
          className="iconify lucide--circle-alert text-lychee-400 h-4 w-4"
        />
        <span className="text-label-sm text-lychee-400">{error}</span>
      </div>
    </div>
  );
}
