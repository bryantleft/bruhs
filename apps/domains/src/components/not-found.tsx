import { Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-longan-950">
      <div className="mx-auto max-w-md px-4 text-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="font-bold text-6xl text-lychee-400">404</div>
            <h1 className="font-bold text-2xl text-lychee-100">
              Page Not Found
            </h1>
          </div>

          <Button
            asChild
            className="w-full bg-mangosteen-600 hover:bg-mangosteen-500"
          >
            <Link to="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
