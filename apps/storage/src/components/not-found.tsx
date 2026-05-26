import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-longan-950">
      <div className="mx-auto max-w-md px-4 text-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="font-bold text-6xl text-rambutan-400">404</div>
            <h1 className="font-bold text-2xl text-rambutan-100">
              Page Not Found
            </h1>
          </div>
          <Link
            to="/"
            className="inline-block w-full rounded-lg bg-mangosteen-600 px-4 py-2 font-medium text-white transition hover:bg-mangosteen-500"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
