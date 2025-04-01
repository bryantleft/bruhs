import type React from "react";
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	isRouteErrorResponse,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import Navigation from "./components/navigation";

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<Navigation />
				<div className="min-h-screen bg-zinc-950">{children}</div>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
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
		<main className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-gray-300 p-6">
			<div className="max-w-md w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-lg p-6 space-y-4">
				<h1 className="text-3xl font-semibold text-red-400">{message}</h1>
				<p className="text-gray-400">{details}</p>
				{stack && (
					<pre className="w-full p-3 overflow-x-auto text-xs bg-zinc-900 border border-zinc-700 rounded-lg">
						<code>{stack}</code>
					</pre>
				)}
			</div>
		</main>
	);
}
