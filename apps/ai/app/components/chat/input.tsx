import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useGlobalHotkey } from "@/lib/hooks/use-global-hotkey";
import { cn } from "@/lib/utils";

type InputProps = {
  generating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export default function Input({ generating, onSend, onStop }: InputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  useGlobalHotkey({
    key: "/",
    handler: (e) => {
      const tag = document.activeElement?.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    },
  });

  // Imperative DOM sync: grow the textarea with its content, up to 200px.
  // biome-ignore lint/correctness/useExhaustiveDependencies: input can change textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "42px";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  function handleSend(): void {
    if (!input.trim() || generating) return;
    onSend(input);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    handleSend();
  }

  return (
    <form
      onSubmit={handleFormSubmit}
      className="surface-panel relative overflow-hidden rounded-b-none py-3 group-hover:[--surface-ring:10%]"
    >
      <div className="relative flex flex-col px-4">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          className={cn(
            "w-full resize-none py-2",
            "text-body-sm text-rambutan-200 placeholder:text-rambutan-400 bg-transparent",
            "focus:outline-none",
            "overflow-y-auto",
            "scrollbar-thumb-rambutan-300 scrollbar-thin scrollbar-track-transparent",
          )}
          placeholder="Bruhhhh..."
          onKeyDown={handleKeyDown}
        />
        <div className="flex self-end">
          {generating ? (
            <button
              type="button"
              aria-label="Stop generating"
              // Keep focus in the textarea while stopping.
              onMouseDown={(e) => e.preventDefault()}
              onClick={onStop}
              className="btn btn-primary btn-icon p-[5px]"
            >
              <span className="spinner size-4" />
              <span className="iconify lucide--dot text-longan-950/60 absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send message"
              disabled={input.trim().length === 0}
              className="btn btn-primary btn-icon p-[5px]"
            >
              <span className="iconify lucide--arrow-up text-longan-950 h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
