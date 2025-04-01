import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("text", "routes/text.tsx"),
	route("code", "routes/code.tsx"),
] satisfies RouteConfig;
