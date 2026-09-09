const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Tile Logistics";

export const BRAND = {
  name: appName,
  shortName: appName,
  tagline: "Orders, warehouse, fleet & delivery",
  warehouse: {
    displayName: "Main warehouse — Shkabaj",
    address: "Shkabaj, 10000 Prishtinë",
    city: "Prishtinë",
    country: "Kosovo",
    lat: 42.67133,
    lng: 21.12447,
    osmUrl: "https://www.openstreetmap.org/#map=15/42.6713/21.1245",
  },
} as const;
