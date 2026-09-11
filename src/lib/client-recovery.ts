const RELOAD_COUNT_KEY = "app-stale-reload-count";
export const STALE_ASSET_RELOAD_KEY = "app-stale-asset-reload";
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

/** Drop leftover cache-bust query params without triggering another navigation. */
export function stripRecoveryQuery() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("_r")) return;
  url.searchParams.delete("_r");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

/** Reload the current URL after clearing caches. Does not add query params. */
export async function reloadFreshApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const count = Number(storageGet(RELOAD_COUNT_KEY) || "0");
  if (count >= MAX_RELOADS) return false;
  storageSet(RELOAD_COUNT_KEY, String(count + 1));
  await clearClientCaches();
  const url = new URL(window.location.href);
  url.searchParams.delete("_r");
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function markRecoverySuccessful() {
  storageRemove(RELOAD_COUNT_KEY);
  storageRemove(STALE_ASSET_RELOAD_KEY);
}
