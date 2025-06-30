export const typographyScale = {
  // Research-based custom scale using Minor Third (1.2) + Perfect Fourth (1.333) hybrid approach
  // Optimized for design systems, Monaspace fonts, and 4px grid alignment
  
  display: [
    { name: "Display Large", className: "text-display-lg", usage: "Hero headlines, landing pages", size: "72px", weight: "300", lineHeight: "1.1" },
    { name: "Display Medium", className: "text-display-md", usage: "Section heroes, major headings", size: "56px", weight: "400", lineHeight: "1.1" },
    { name: "Display Small", className: "text-display-sm", usage: "Page headers, primary headings", size: "44px", weight: "400", lineHeight: "1.15" }
  ],
  
  headings: [
    { name: "Heading 1", className: "text-h1", usage: "Primary page headings", size: "32px", weight: "500", lineHeight: "1.25" },
    { name: "Heading 2", className: "text-h2", usage: "Section headings", size: "24px", weight: "500", lineHeight: "1.3" },
    { name: "Heading 3", className: "text-h3", usage: "Sub-section headings", size: "20px", weight: "500", lineHeight: "1.3" },
    { name: "Heading 4", className: "text-h4", usage: "Component headings", size: "18px", weight: "500", lineHeight: "1.4" }
  ],
  
  body: [
    { name: "Body Large", className: "text-body-lg", usage: "Emphasis text, lead paragraphs", size: "18px", weight: "400", lineHeight: "1.6" },
    { name: "Body Default", className: "text-body", usage: "Primary content, paragraphs", size: "16px", weight: "400", lineHeight: "1.6" },
    { name: "Body Small", className: "text-body-sm", usage: "Secondary content, dense layouts", size: "14px", weight: "400", lineHeight: "1.5" }
  ],
  
  labels: [
    { name: "Label Large", className: "text-label-lg", usage: "Form labels, menu items", size: "16px", weight: "500", lineHeight: "1.5" },
    { name: "Label Default", className: "text-label", usage: "UI labels, metadata", size: "14px", weight: "500", lineHeight: "1.5" },
    { name: "Label Small", className: "text-label-sm", usage: "Captions, annotations", size: "12px", weight: "500", lineHeight: "1.5" }
  ],
  
  code: [
    { name: "Code Large", className: "text-code-lg", usage: "Code blocks, documentation", size: "16px", weight: "400", lineHeight: "1.6", mono: true },
    { name: "Code Default", className: "text-code", usage: "Inline code, snippets", size: "14px", weight: "400", lineHeight: "1.5", mono: true },
    { name: "Code Small", className: "text-code-sm", usage: "Small code annotations", size: "12px", weight: "400", lineHeight: "1.5", mono: true }
  ],
  
  interactive: [
    { name: "Button Large", className: "text-button-lg", usage: "Primary action buttons", size: "16px", weight: "500", lineHeight: "1.5" },
    { name: "Button Default", className: "text-button", usage: "Standard buttons", size: "14px", weight: "500", lineHeight: "1.5" },
    { name: "Button Small", className: "text-button-sm", usage: "Compact buttons, tags", size: "12px", weight: "500", lineHeight: "1.5" }
  ]
};

export const typographyCategories = [
  { key: "display", title: "Display", description: "Large, impactful text for heroes and major statements" },
  { key: "headings", title: "Headings", description: "Structured hierarchy for content organization" },
  { key: "body", title: "Body", description: "Reading text optimized for legibility and flow" },
  { key: "labels", title: "Labels", description: "UI elements, metadata, and short-form content" },
  { key: "code", title: "Code", description: "Monospace text for technical content" },
  { key: "interactive", title: "Interactive", description: "Buttons, links, and actionable elements" }
];

// Mathematical principles used:
// - Minor Third (1.2) for body text progression 
// - Perfect Fourth (1.333) for heading hierarchy
// - 4px grid alignment for all sizes
// - WCAG 1.5x line-height minimum for body text
// - Tighter line-heights (1.1-1.3) for display/headings
// - Optimized for Monaspace font characteristics 