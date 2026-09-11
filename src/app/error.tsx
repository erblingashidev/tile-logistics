"use client";

import { useEffect } from "react";
import { reloadFreshApp } from "@/lib/client-recovery";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-white">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-zinc-400">
        The page hit an unexpected error. Reload the latest version, or try a
        private/incognito window if this computer is on a work network.
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
  );
}
