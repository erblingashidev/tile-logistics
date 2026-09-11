"use client";

import { useEffect } from "react";
import {
  isStaleAssetError,
  markRecoverySuccessful,
  reloadFreshApp,
  stripRecoveryQuery,
} from "@/lib/client-recovery";

/** Auto-recover when a stale tab serves JS from a previous deploy. */
export function ClientRecovery() {
  useEffect(() => {
    stripRecoveryQuery();

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isStaleAssetError(event.reason)) return;
      event.preventDefault();
      void reloadFreshApp();
    };

    const onError = (event: ErrorEvent) => {
      if (!isStaleAssetError(event.message) && !isStaleAssetError(event.error)) {
        return;
      }
      event.preventDefault();
      void reloadFreshApp();
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);

    const okTimer = window.setTimeout(() => {
      markRecoverySuccessful();
    }, 4000);

    return () => {
      window.clearTimeout(okTimer);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
