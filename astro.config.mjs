import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://bryantleft.com",
	integrations: [
		sitemap(),
		tailwind({
			applyBaseStyles: false,
		}),
	],
});
