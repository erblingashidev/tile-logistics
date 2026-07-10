/** Kosovo map defaults — centered on AGIMI warehouse (Shkabaj depot). */
export const KOSOVO_MAP_CENTER = {
  lat: 42.6764,
  lng: 21.1147,
} as const;

export const KOSOVO_MAP_BOUNDS: [[number, number], [number, number]] = [
  [19.95, 41.75],
  [22.15, 43.35],
];

export function getMapStyleUrl(): string {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  if (mapboxToken) {
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${mapboxToken}`;
  }

  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  if (maptilerKey) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`;
  }

  return "https://tiles.openfreemap.org/styles/liberty";
}

export function getMapAttribution(): string {
  if (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim()) {
    return "© Mapbox © OpenStreetMap";
  }
  if (process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim()) {
    return "© MapTiler © OpenStreetMap";
  }
  return "© OpenStreetMap contributors";
}
