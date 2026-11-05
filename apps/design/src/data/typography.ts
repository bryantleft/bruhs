export type TypographyItem = {
  name: string;
  className: string;
  usage: string;
  size: string;
  weight: string;
  lineHeight: string;
  font?: string;
  mono?: boolean;
};

export type TypographyCategory =
  | "display"
  | "headings"
  | "body"
  | "labels"
  | "code"
  | "interactive"
  | "callout";

export const typographyScale: Record<TypographyCategory, TypographyItem[]> = {
  display: [
    { name: "Display large", className: "text-display-lg", usage: "Hero headlines", size: "72px", weight: "300", lineHeight: "1.1", font: "Krypton" },
    { name: "Display medium", className: "text-display-md", usage: "Section titles", size: "56px", weight: "400", lineHeight: "1.1", font: "Krypton" },
    { name: "Display small", className: "text-display-sm", usage: "Page titles", size: "44px", weight: "400", lineHeight: "1.15", font: "Krypton" }
  ],

  headings: [
    { name: "Heading 1", className: "text-h1", usage: "Primary page headings", size: "32px", weight: "500", lineHeight: "1.25", font: "Xenon" },
    { name: "Heading 2", className: "text-h2", usage: "Section headings", size: "24px", weight: "500", lineHeight: "1.3", font: "Xenon" },
    { name: "Heading 3", className: "text-h3", usage: "Subsection headings", size: "20px", weight: "500", lineHeight: "1.3", font: "Xenon" },
    { name: "Heading 4", className: "text-h4", usage: "Component headings", size: "18px", weight: "500", lineHeight: "1.4", font: "Xenon" }
  ],

  body: [
    { name: "Body large", className: "text-body-lg", usage: "Lead paragraphs", size: "18px", weight: "400", lineHeight: "1.6", font: "Neon" },
    { name: "Body default", className: "text-body", usage: "Main content", size: "16px", weight: "400", lineHeight: "1.6", font: "Neon" },
    { name: "Body small", className: "text-body-sm", usage: "Secondary content", size: "14px", weight: "400", lineHeight: "1.5", font: "Neon" }
  ],

  labels: [
    { name: "Label large", className: "text-label-lg", usage: "Form labels", size: "16px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Label default", className: "text-label", usage: "Labels and metadata", size: "14px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Label small", className: "text-label-sm", usage: "Captions and annotations", size: "12px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Eyebrow", className: "text-eyebrow", usage: "Uppercase label above a heading or group", size: "11px", weight: "500", lineHeight: "1.5", font: "Argon" }
  ],

  code: [
    { name: "Code large", className: "text-code-lg", usage: "Code blocks", size: "16px", weight: "400", lineHeight: "1.6", font: "Neon", mono: true },
    { name: "Code default", className: "text-code", usage: "Code snippets", size: "14px", weight: "400", lineHeight: "1.5", font: "Neon", mono: true },
    { name: "Code small", className: "text-code-sm", usage: "Code annotations", size: "12px", weight: "400", lineHeight: "1.5", font: "Neon", mono: true }
  ],

  interactive: [
    { name: "Button large", className: "text-button-lg", usage: "Primary action buttons", size: "16px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Button default", className: "text-button", usage: "Standard buttons", size: "14px", weight: "500", lineHeight: "1.5", font: "Argon" },
    { name: "Button small", className: "text-button-sm", usage: "Compact buttons", size: "12px", weight: "500", lineHeight: "1.5", font: "Argon" }
  ],

  callout: [
    { name: "Callout", className: "text-callout", usage: "Pull quotes and asides", size: "18px", weight: "400", lineHeight: "1.5", font: "Radon" }
  ]
};

export const typographyCategories: {
  key: TypographyCategory;
  title: string;
  description: string;
}[] = [
  { key: "display", title: "Display (Krypton)", description: "Use for hero text and page titles." },
  { key: "headings", title: "Headings (Xenon)", description: "Use to organize sections and components." },
  { key: "body", title: "Body (Neon)", description: "Use for paragraphs and longer reading." },
  { key: "labels", title: "Labels (Argon)", description: "Use for short labels and metadata." },
  { key: "code", title: "Code (Neon)", description: "Use the body font for code too." },
  { key: "interactive", title: "Interactive (Argon)", description: "Use for buttons and action labels." },
  { key: "callout", title: "Callout (Radon)", description: "Use for pull quotes and asides." }
];
