import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/llm", "routes/api.llm.ts"),
] satisfies RouteConfig;
