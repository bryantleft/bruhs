import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="empty-state min-h-dvh">
      <p className="text-display-md text-rambutan-400">404</p>
      <h1 className="text-h1 text-rambutan-100 text-balance">Page Not Found</h1>
      <Link to="/" className="btn btn-primary mt-4">
        Go Home
      </Link>
    </main>
  );
}
