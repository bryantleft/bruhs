import { useId } from "react";
import { MIN_NAME_LENGTH, type ParsedQuery, sanitizeInput } from "~/lib/query";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** The parsed value, so the field can explain why it isn't searching. */
  parsed: ParsedQuery;
}

/** Helper text for the field, and whether it describes an error. */
function feedback(parsed: ParsedQuery): { text: string; isError: boolean } {
  switch (parsed.kind) {
    case "invalid-label":
      return {
        text: "Use letters, numbers and hyphens, with no hyphen at the start or end of a part.",
        isError: true,
      };
    case "too-short":
      return {
        text: `Names need at least ${MIN_NAME_LENGTH} characters.`,
        isError: true,
      };
    case "invalid-tld":
      return { text: `${parsed.tld} isn't a top-level domain.`, isError: true };
    case "incomplete":
      return {
        text: "Finish the TLD after the dot, or remove the dot to check popular ones.",
        isError: false,
      };
    default:
      return {
        text: "Type a name to check popular TLDs, or add one (example.io) to check just that domain.",
        isError: false,
      };
  }
}

export function SearchInput({ value, onChange, parsed }: Props) {
  const inputId = useId();
  const helpId = useId();
  const { text, isError } = feedback(parsed);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-2 text-left">
      <label htmlFor={inputId} className="sr-only">
        Domain name
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(sanitizeInput(e.target.value))}
        placeholder="Search for domains..."
        aria-invalid={isError}
        aria-describedby={helpId}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        // biome-ignore lint/a11y/noAutofocus: searching is the page's only task.
        autoFocus
        className="input text-body-lg h-14 px-6"
      />
      <p
        id={helpId}
        aria-live="polite"
        className={`text-body-sm px-1 text-pretty ${
          isError ? "text-lychee-300" : "text-rambutan-400"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
