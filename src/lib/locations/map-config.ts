/** Kosovo map defaults — centered on AGIMI warehouse (Shkabaj depot). */
export const KOSOVO_MAP_CENTER = {
  lat: 42.6764,
  lng: 21.1147,
} as const;

export const KOSOVO_MAP_BOUNDS: [[number, number], [number, number]] = [
  [19.95, 41.75],
  [22.15, 43.35],
];

function mapboxToken(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    undefined
  );
}

function maptilerKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() ||
    process.env.MAPTILER_KEY?.trim() ||
    undefined
  );
}

export type MapTileProvider = "mapbox" | "maptiler" | "openfreemap";

export function getMapTileProvider(): MapTileProvider {
  if (mapboxToken()) return "mapbox";
  if (maptilerKey()) return "maptiler";
  return "openfreemap";
}

/** Resolve map style at runtime (server API or build). Supports server-only env keys. */
export function getMapStyleUrl(): string {
  const mapbox = mapboxToken();
  if (mapbox) {
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${mapbox}`;
  }

  const maptiler = maptilerKey();
  if (maptiler) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptiler}`;
  }

  return "https://tiles.openfreemap.org/styles/liberty";
}

export function getMapAttribution(): string {
  if (mapboxToken()) return "© Mapbox © OpenStreetMap";
  if (maptilerKey()) return "© MapTiler © OpenStreetMap";
  return "© OpenStreetMap contributors";
}

export function getMapConfig() {
  return {
    styleUrl: getMapStyleUrl(),
    attribution: getMapAttribution(),
    provider: getMapTileProvider(),
    hasKey: getMapTileProvider() !== "openfreemap",
  };
}
