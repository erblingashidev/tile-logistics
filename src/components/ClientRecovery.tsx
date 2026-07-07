"use client";

import { useEffect } from "react";

const RELOAD_ONCE_KEY = "app-chunk-reload-once";

function isChunkLoadError(reason: unknown): boolean {
  const msg = String(
    reason instanceof Error ? reason.message : reason ?? ""
  );
  return /loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg
  );
}

function reloadOnceForChunkError() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(RELOAD_ONCE_KEY)) return;
  sessionStorage.setItem(RELOAD_ONCE_KEY, "1");
  window.location.reload();
}

/** Auto-recover when a stale tab loads JS chunks from a previous deploy. */
export function ClientRecovery() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) return;
      event.preventDefault();
      reloadOnceForChunkError();
    };

    const onError = (event: ErrorEvent) => {
      if (!isChunkLoadError(event.message)) return;
      event.preventDefault();
      reloadOnceForChunkError();
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
