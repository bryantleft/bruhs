import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.{astro,svelte,ts}"],
	theme: {
		colors: {
			black: "#111111",
			white: "#cccccc",
		},
		fontFamily: {
			krypton: ["MonaspaceKryptonVariable", ...defaultTheme.fontFamily.mono],
		},
		extend: {},
	},
	plugins: [],
};
