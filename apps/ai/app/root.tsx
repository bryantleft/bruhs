import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
} from "react-router";
import { Toaster } from "sonner";
import type { Route } from "./+types/root";
import "@/root.css";
import Provider from "@/provider";

export default function App() {
  return (
    <html lang="en" className="h-full">
      <head>
        {process.env.NODE_ENV === "development" && (
          <script
            crossOrigin="anonymous"
            src="https://unpkg.com/react-scan/dist/auto.global.js"
          />
        )}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <Meta />
        <Links />
      </head>
      <body className="h-full overscroll-none">
        <Provider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  "surface-panel rounded-grape absolute right-0 w-fit p-2 hover:[--surface-ring:10%]",
              },
            }}
          />
          <Outlet />
          <Scripts />
        </Provider>
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? error.status === 404
      ? "404"
      : "Error"
    : "Oops!";

  const details = isRouteErrorResponse(error)
    ? error.status === 404
      ? "The requested page could not be found."
      : error.statusText || "An unexpected error occurred."
    : import.meta.env.DEV && error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  const stack =
    import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <main className="text-rambutan-300 flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="surface-panel w-full max-w-md space-y-4 p-6">
        <h1 className="text-h1 text-lychee-400">{message}</h1>
        <p className="text-body text-rambutan-400">{details}</p>
        {stack && (
          <pre className="code-block rounded-grape text-code-sm w-full p-3">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
