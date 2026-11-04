import type { BruhVariant } from "@bruhs/theme/logo";

export type LogoVariant = {
  id: BruhVariant;
  name: string;
  fileName: string;
  description: string;
};

export const logoVariants: LogoVariant[] = [
  {
    id: "left",
    name: "Left",
    fileName: "left.svg",
    description: "Suspicious sideways glance",
  },
  {
    id: "original",
    name: "Original",
    fileName: "original.svg",
    description: "Classic deadpan expression",
  },
  {
    id: "right",
    name: "Right",
    fileName: "right.svg",
    description: "Skeptical right-side glance",
  }
];

/** A logo colourway, named by theme colour tokens (see `colorToken`). */
export type ColorVariation = {
  id: string;
  name: string;
  base: string;
  eyes: string;
  mouth: string;
};

/** A colourway with its tokens resolved to literal colours. */
export type ResolvedColorVariation = {
  id: string;
  name: string;
  baseColor: string;
  eyeColor: string;
  mouthColor: string;
};

// Eyes and mouth are chosen per base colour for contrast: dark features on warm bases,
// warm features on cool ones.
export const colorVariations: ColorVariation[] = [
  { id: "classic", name: "Classic", base: "bruh-base", eyes: "bruh-eye", mouth: "bruh-mouth" },
  { id: "lychee", name: "Lychee", base: "lychee-500", eyes: "bruh-eye", mouth: "durian-400" },
  { id: "persimmon", name: "Persimmon", base: "persimmon-500", eyes: "bruh-eye", mouth: "lychee-600" },
  { id: "durian", name: "Durian", base: "durian-500", eyes: "bruh-eye", mouth: "lychee-600" },
  { id: "pandan", name: "Pandan", base: "pandan-500", eyes: "bruh-eye", mouth: "lychee-600" },
  { id: "blueberry", name: "Blueberry", base: "blueberry-500", eyes: "durian-400", mouth: "persimmon-500" },
  { id: "mangosteen", name: "Mangosteen", base: "mangosteen-500", eyes: "durian-400", mouth: "persimmon-500" },
  { id: "dragonfruit", name: "Dragonfruit", base: "dragonfruit-500", eyes: "blueberry-950", mouth: "blueberry-600" },
];
