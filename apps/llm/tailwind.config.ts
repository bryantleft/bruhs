import type { Config } from "tailwindcss";
import tailwindScrollbar from "tailwind-scrollbar";
import { addIconSelectors } from "@iconify/tailwind";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  plugins: [
    tailwindScrollbar(),
    addIconSelectors(['lucide','vscode-icons']),
  ],
} satisfies Config;