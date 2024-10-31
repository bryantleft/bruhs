import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
	content: ["./app/**/*.{ts,tsx}"],
	theme: {
		colors: {
			"jet-black": "#0A0A0A",
			"royal-yellow": "#FADA5E",
			bruh: {
				eye: "#222222",
				mouth: "#FC4141",
			},
		},
		fontFamily: {
			argon: ["MonaspaceArgonVariable", ...defaultTheme.fontFamily.mono],
			krypton: ["MonaspaceKryptonVariable", ...defaultTheme.fontFamily.mono],
			neon: ["MonaspaceNeonVariable", ...defaultTheme.fontFamily.mono],
			radon: ["MonaspaceRadonVariable", ...defaultTheme.fontFamily.mono],
			xenon: ["MonaspaceXenonVariable", ...defaultTheme.fontFamily.mono],
		},
		extend: {},
	},
	plugins: [],
} satisfies Config;
