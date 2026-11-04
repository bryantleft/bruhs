import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <div className="bg-longan-950 flex min-h-screen items-center justify-center">
      <div className="mx-auto max-w-md space-y-6 px-4 text-center">
        <div className="space-y-2">
          <div className="text-rambutan-400 text-6xl font-semibold">404</div>
          <h1 className="text-rambutan-100 text-2xl font-semibold">
            Page Not Found
          </h1>
        </div>
        <Link
          to="/"
          className="rounded-grape bg-persimmon-500 text-longan-950 hover:bg-persimmon-400 focus-visible:outline-persimmon-400 inline-block w-full px-4 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
