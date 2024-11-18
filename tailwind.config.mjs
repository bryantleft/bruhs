import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.{astro,svelte,ts}"],
	theme: {
		colors: {
			black: "#111111",
			white: "#cccccc",
			'platinum': {
				'50': '#f6f6f6',
				'100': '#e5e4e2',
				DEFAULT: '#e5e4e2',
				'200': '#d6d4d2',
				'300': '#bcbab5',
				'400': '#a19c96',
				'500': '#8e8781',
				'600': '#817a75',
				'700': '#6c6662',
				'800': '#5a5552',
				'900': '#4a4744',
				'950': '#272423',
			},
		},
		fontFamily: {
			krypton: ["MonaspaceKryptonVariable", ...defaultTheme.fontFamily.mono],
		},
		extend: {},
	},
	plugins: [],
};
