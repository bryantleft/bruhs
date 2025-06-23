import { useState, useCallback } from "preact/hooks";

export const useCopy = () => {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }, []);

  return { copied, handleCopy };
};