"use client";

import { reloadFreshApp } from "@/lib/client-recovery";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-white antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-center text-sm text-zinc-400">
            {error.message ||
              "The application failed to load. Reload, or try a private/incognito window."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                void reloadFreshApp().then((started) => {
                  if (!started) window.location.reload();
                });
              }}
              className="rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Reload latest version
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="rounded border border-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
