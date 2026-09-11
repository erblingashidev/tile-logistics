"use client";

import { useEffect, useState } from "react";
import { recoverFromRenderError, reloadFreshApp } from "@/lib/client-recovery";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recovering, setRecovering] = useState(true);

  useEffect(() => {
    console.error("[app/error]", error);
    let cancelled = false;
    void recoverFromRenderError(reset).then((started) => {
      if (!cancelled && !started) setRecovering(false);
    });
    const timer = window.setTimeout(() => {
      if (!cancelled) setRecovering(false);
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [error, reset]);

  if (recovering) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-sm text-zinc-400">
        Loading latest version…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-white">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-zinc-400">
        This computer may be using an old cached copy of the site. That is
        common on work laptops and company networks. Reload the latest version,
        or try a private/incognito window.
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
      <p className="max-w-md text-center text-xs text-zinc-500">
        Still stuck? Press Ctrl+Shift+R (Cmd+Shift+R on Mac), or open this site
        in Chrome/Edge InPrivate. If that works, clear cached files for
        logistics-core.netlify.app.
      </p>
    </div>
  );
}
