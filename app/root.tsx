import { Links, Meta, Outlet, Scripts } from "@remix-run/react";
import "@/root.css";
import { Toaster } from "sonner";

export default function App() {
	return (
		<html lang="en" className="h-full">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body className="h-full bg-platinum-950 overscroll-none font-neon">
				<Toaster
					position="bottom-right"
					toastOptions={{
						unstyled: true,
						classNames: {
							toast:
								"absolute right-0 bg-platinum-900 border border-platinum-800 hover:border-platinum-700 w-fit p-2 rounded-lg",
						},
					}}
				/>
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
}
