export type LogoVariant = {
  id: string;
  name: string;
  fileName: string;
  description: string;
  eyePositions: { left: { x: number; y: number }, right: { x: number; y: number } };
  mouthPosition: { x: number; y: number };
};

export const logoVariants: LogoVariant[] = [
  {
    id: "left",
    name: "Left",
    fileName: "left.svg",
    description: "Suspicious sideways glance",
    eyePositions: {
      left: { x: 97, y: 209 },
      right: { x: 300, y: 209 }
    },
    mouthPosition: { x: 191, y: 364 },
  },
  {
    id: "original",
    name: "Original",
    fileName: "original.svg",
    description: "Classic deadpan expression",
    eyePositions: {
      left: { x: 198, y: 223 },
      right: { x: 401, y: 223 }
    },
    mouthPosition: { x: 307, y: 378 },
  },
  {
    id: "right",
    name: "Right",
    fileName: "right.svg",
    description: "Skeptical right-side glance",
    eyePositions: {
      left: { x: 300, y: 209 },
      right: { x: 503, y: 209 }
    },
    mouthPosition: { x: 409, y: 364 },
  }
];

export const colorVariations = [
  {
    id: "classic",
    name: "Classic",
    baseColor: "#FADA5E",
    colorName: "yellow"
  },
  {
    id: "rambutan",
    name: "Rambutan",
    baseColor: "#ef4444", // Using a red shade similar to rambutan-500
    colorName: "rambutan"
  },
  {
    id: "persimmon",
    name: "Persimmon",
    baseColor: "#f97316", // Using an orange shade similar to persimmon-500
    colorName: "persimmon"
  },
  {
    id: "durian",
    name: "Durian",
    baseColor: "#eab308", // Using a yellow-green shade similar to durian-500
    colorName: "durian"
  },
  {
    id: "guava",
    name: "Guava",
    baseColor: "#84cc16", // Using a green shade similar to guava-500
    colorName: "guava"
  },
  {
    id: "blueberry",
    name: "Blueberry",
    baseColor: "#3b82f6", // Using a blue shade similar to blueberry-500
    colorName: "blueberry"
  },
  {
    id: "mangosteen",
    name: "Mangosteen",
    baseColor: "#8b5cf6", // Using a purple shade similar to mangosteen-500
    colorName: "mangosteen"
  },
  {
    id: "dragonfruit",
    name: "Dragonfruit",
    baseColor: "#ec4899", // Using a pink shade similar to dragonfruit-500
    colorName: "dragonfruit"
  }
];