import type { Config } from "tailwindcss";
import { addIconSelectors } from "@iconify/tailwind";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  plugins: [
    addIconSelectors(['lucide','vscode-icons']),
  ],
} satisfies Config;