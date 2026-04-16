export const typographyScale: Record<string, any[]> = {
  display: [
    { name: "Display Large", className: "text-display-lg", usage: "Hero headlines, landing pages", size: "72px", weight: "300", lineHeight: "1.1", font: "Krypton" },
    { name: "Display Medium", className: "text-display-md", usage: "Section heroes, major headings", size: "56px", weight: "400", lineHeight: "1.1", font: "Krypton" },
    { name: "Display Small", className: "text-display-sm", usage: "Page headers, primary headings", size: "44px", weight: "400", lineHeight: "1.15", font: "Krypton" }
  ],

  headings: [
    { name: "Heading 1", className: "text-h1", usage: "Primary page headings", size: "32px", weight: "500", lineHeight: "1.25", font: "Xenon" },
    { name: "Heading 2", className: "text-h2", usage: "Section headings", size: "24px", weight: "500", lineHeight: "1.3", font: "Xenon" },
    { name: "Heading 3", className: "text-h3", usage: "Sub-section headings", size: "20px", weight: "500", lineHeight: "1.3", font: "Xenon" },
    { name: "Heading 4", className: "text-h4", usage: "Component headings", size: "18px", weight: "500", lineHeight: "1.4", font: "Xenon" }
  ],

  body: [
    { name: "Body Large", className: "text-body-lg", usage: "Emphasis text, lead paragraphs", size: "18px", weight: "400", lineHeight: "1.6", font: "Neon" },
    { name: "Body Default", className: "text-body", usage: "Primary content, paragraphs", size: "16px", weight: "400", lineHeight: "1.6", font: "Neon" },
    { name: "Body Small", className: "text-body-sm", usage: "Secondary content, dense layouts", size: "14px", weight: "400", lineHeight: "1.5", font: "Neon" }
  ],

  labels: [
    { name: "Label Large", className: "text-label-lg", usage: "Form labels, menu items", size: "16px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Label Default", className: "text-label", usage: "UI labels, metadata", size: "14px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Label Small", className: "text-label-sm", usage: "Captions, annotations", size: "12px", weight: "500", lineHeight: "1.5", font: "Argon" }
  ],

  code: [
    { name: "Code Large", className: "text-code-lg", usage: "Code blocks, documentation", size: "16px", weight: "400", lineHeight: "1.6", font: "Neon", mono: true },
    { name: "Code Default", className: "text-code", usage: "Inline code, snippets", size: "14px", weight: "400", lineHeight: "1.5", font: "Neon", mono: true },
    { name: "Code Small", className: "text-code-sm", usage: "Small code annotations", size: "12px", weight: "400", lineHeight: "1.5", font: "Neon", mono: true }
  ],

  interactive: [
    { name: "Button Large", className: "text-button-lg", usage: "Primary action buttons", size: "16px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Button Default", className: "text-button", usage: "Standard buttons", size: "14px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Button Small", className: "text-button-sm", usage: "Compact buttons, tags", size: "12px", weight: "500", lineHeight: "1.5", font: "Argon" }
  ],

  callout: [
    { name: "Callout", className: "text-callout", usage: "Pull quotes, asides, reviewer notes", size: "18px", weight: "400", lineHeight: "1.5", font: "Radon" }
  ]
};

export const typographyCategories = [
  { key: "display", title: "Display — Krypton", description: "Geometric, imposing. Hero moments only." },
  { key: "headings", title: "Headings — Xenon", description: "Slab-serif mono for structural hierarchy." },
  { key: "body", title: "Body — Neon", description: "Most neutral Monaspace variant — prose and long-form." },
  { key: "labels", title: "Labels — Argon", description: "Humanist mono; friendlier at small sizes." },
  { key: "code", title: "Code — Neon", description: "Code reuses body so prose and code share one voice." },
  { key: "interactive", title: "Interactive — Argon", description: "Buttons and action chips read as labels, not prose." },
  { key: "callout", title: "Callout — Radon", description: "Handwritten mono. Pull quotes and aside annotations only." }
];
