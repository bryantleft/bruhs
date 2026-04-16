import { useState, type FunctionComponent } from "react";

type Props = {
  content: string;
  label?: string;
};

const CopyLLMsButton: FunctionComponent<Props> = ({ content, label = "Copy for your LLM" }) => {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const buttonLabel =
    status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-grape bg-persimmon-500 py-2 pr-3 pl-2 text-button text-longan-950 ring-1 ring-persimmon-500 hover:bg-persimmon-400 hover:ring-persimmon-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 active:bg-persimmon-600 transition"
      aria-live="polite"
    >
      {status === "copied" ? (
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0" aria-hidden="true">
          <path d="M5.75 1.5A2.25 2.25 0 0 0 3.5 3.75v7.5A2.25 2.25 0 0 0 5.75 13.5h4.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-4.5ZM5 3.75A.75.75 0 0 1 5.75 3h4.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5Z" />
          <path d="M2 5.75a.75.75 0 0 1 .75.75v6.5A1.25 1.25 0 0 0 4 14.25h5.5a.75.75 0 0 1 0 1.5H4A2.75 2.75 0 0 1 1.25 13v-6.5A.75.75 0 0 1 2 5.75Z" />
        </svg>
      )}
      {buttonLabel}
    </button>
  );
};

export default CopyLLMsButton;
