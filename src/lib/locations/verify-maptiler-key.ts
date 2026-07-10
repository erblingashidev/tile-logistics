import { getMaptilerKey } from "@/lib/locations/map-config";

export async function verifyMapTilerKey(key: string): Promise<{
  ok: boolean;
  status: number;
  detail?: string;
}> {
  const url = `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return { ok: true, status: res.status };
    const detail = (await res.text()).slice(0, 200);
    return { ok: false, status: res.status, detail };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function resolveMapTilerKeyHint(): Promise<string | undefined> {
  const key = getMaptilerKey();
  if (!key) return undefined;
  if (key.length < 8) return "too short";
  return `…${key.slice(-4)}`;
}
