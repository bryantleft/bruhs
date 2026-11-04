import { useState } from "react";

type CodeViewerProps = {
  /** Plain source, for copying. */
  code: string;
  /** The same source as highlighted HTML, rendered at build time by shiki. */
  html: string;
  title?: string;
};

export default function CodeViewer({ code, html, title }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className="overflow-hidden rounded-grape border border-rambutan-100/10 bg-longan-900">
      <div className="flex items-center justify-between border-b border-rambutan-100/10 px-4 py-3">
        {title && <span className="font-mono text-sm text-rambutan-300">{title}</span>}
        <button
          type="button"
          onClick={copyToClipboard}
          aria-live="polite"
          className="flex items-center gap-2 rounded-grape border border-rambutan-100/10 bg-longan-800/50 px-3 py-1.5 text-xs text-rambutan-300 transition-all duration-200 hover:bg-longan-800 hover:text-rambutan-100 focus-visible:outline-2 focus-visible:outline-persimmon-400"
        >
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            {copied ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            )}
          </svg>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="max-h-96 overflow-auto">
        <div
          className="text-sm leading-relaxed [&_code]:!bg-transparent [&_code]:!p-0 [&>pre]:!m-0 [&>pre]:!overflow-visible [&>pre]:!border-0 [&>pre]:!bg-transparent [&>pre]:!p-4"
          // Highlighted by shiki at build time from the app's own template (not user input);
          // the only substituted values are HTML-escaped by `fillLogoCode`.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
