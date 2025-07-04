import { useState, useEffect, useMemo, useCallback } from "react";
import { createHighlighter } from "shiki";

interface CodeViewerProps {
  code: string;
  language: string;
  title?: string;
}

// Create a singleton highlighter instance
let highlighterInstance: any = null;

const CodeViewer: React.FC<CodeViewerProps> = ({ code, language, title }) => {
  const [highlightedCode, setHighlightedCode] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Memoize the highlighter creation to avoid recreating it
  const getHighlighter = useMemo(async () => {
    if (!highlighterInstance) {
      try {
        highlighterInstance = await createHighlighter({
          themes: ["github-dark"],
          langs: [language as any],
        });
      } catch (error) {
        console.error("Error creating highlighter:", error);
        return null;
      }
    }
    return highlighterInstance;
  }, [language]);

  useEffect(() => {
    const highlightCode = async () => {
      try {
        const highlighter = await getHighlighter;
        if (!highlighter) {
          setHighlightedCode(`<pre><code>${code}</code></pre>`);
          return;
        }

        const html = highlighter.codeToHtml(code, {
          lang: language,
          theme: "github-dark",
        });

        setHighlightedCode(html);
      } catch (error) {
        console.error("Error highlighting code:", error);
        setHighlightedCode(`<pre><code>${code}</code></pre>`);
      }
    };

    highlightCode();
  }, [code, language, getHighlighter]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [code]);

  return (
    <div className="rounded-lg bg-longan-900 border border-lychee-100/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-lychee-100/10">
        <div className="flex items-center">
          {title && (
            <span className="text-sm text-lychee-300 font-mono">{title}</span>
          )}
        </div>
        
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-lychee-300 hover:text-lychee-100 bg-longan-800/50 hover:bg-longan-800 rounded-md transition-all duration-200 border border-lychee-100/10"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="overflow-auto max-h-96">
        <div 
          className="text-sm leading-relaxed [&>pre]:!bg-transparent [&>pre]:!p-4 [&>pre]:!m-0 [&>pre]:!border-0 [&>pre]:!overflow-visible [&_code]:!bg-transparent [&_code]:!p-0"
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </div>
    </div>
  );
};

export default CodeViewer;