const RELOAD_COUNT_KEY = "app-stale-reload-count";
const ERROR_RESET_KEY = "app-error-reset-count";
const MAX_RELOADS = 2;

export function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode / corporate policy can block storage.
  }
}

export function storageRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function isStaleAssetError(reason: unknown): boolean {
  const msg = String(
    reason instanceof Error ? reason.message : reason ?? ""
  );
  return /loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading CSS chunk/i.test(
    msg
  );
}

export async function clearClientCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore
  }
}

/** Bypass browser and proxy caches after a deploy or failed chunk load. */
export async function reloadFreshApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const count = Number(storageGet(RELOAD_COUNT_KEY) || "0");
  if (count >= MAX_RELOADS) return false;
  storageSet(RELOAD_COUNT_KEY, String(count + 1));
  await clearClientCaches();
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export function markRecoverySuccessful() {
  storageRemove(RELOAD_COUNT_KEY);
  storageRemove(ERROR_RESET_KEY);
}

export async function recoverFromRenderError(
  reset: () => void
): Promise<boolean> {
  const resets = Number(storageGet(ERROR_RESET_KEY) || "0");
  if (resets < 1) {
    storageSet(ERROR_RESET_KEY, String(resets + 1));
    reset();
    return true;
  }
  return reloadFreshApp();
}
