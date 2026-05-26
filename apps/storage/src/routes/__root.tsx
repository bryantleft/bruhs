/// <reference types="vite/client" />

import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NotFound } from "~/components/not-found";
import { queryClient } from "~/lib/query-client";
import appCss from "~/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Storage — disk profiler" },
      {
        name: "description",
        content: "Profile and manage disk usage across your computer.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark antialiased">
      <head>
        <HeadContent />
      </head>
      <body className="bg-longan-950 text-lychee-100 [background-image:radial-gradient(70rem_50rem_at_78%_-15%,var(--color-blueberry-950),transparent_70%)]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
