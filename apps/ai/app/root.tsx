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
import { useMessageStoreSync } from "@/lib/hooks/use-message-store-sync";
import Provider from "@/provider";

export default function App() {
  useMessageStoreSync();

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
      <body className="h-full overscroll-none bg-longan-950 font-neon">
        <Provider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  "absolute right-0 bg-longan-900 border border-longan-800 hover:border-longan-700 w-fit p-2 rounded-lg",
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-longan-950 p-6 text-rambutan-300">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-longan-700 bg-longan-900 p-6 shadow-lg">
        <h1 className="font-semibold text-3xl text-lychee-400">{message}</h1>
        <p className="text-rambutan-400">{details}</p>
        {stack && (
          <pre className="w-full overflow-x-auto rounded-lg border border-longan-700 bg-longan-900 p-3 text-xs">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
