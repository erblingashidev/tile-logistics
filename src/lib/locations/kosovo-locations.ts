/** OpenStreetMap-based locations for Kosovo (XK). Coordinates from OSM / Geofabrik 2026. */

export interface LocationEntry {
  id: string;
  name: string;
  city: string;
  region: string;
  type:
    | "warehouse"
    | "city"
    | "district"
    | "industrial"
    | "commercial"
    | "village";
  lat: number;
  lng: number;
  postalCode?: string;
}

/** AGIMI Warehouse — Shkabaj, 10000 Prishtinë (OSM: place=village Shkabaj) */
export const WAREHOUSE_LOCATION: LocationEntry = {
  id: "agimi-warehouse-shkabaj",
  name: "AGIMI Warehouse — Shkabaj",
  city: "Prishtinë",
  region: "Prishtinë",
  type: "warehouse",
  lat: 42.67133,
  lng: 21.12447,
  postalCode: "10000",
};

export const KOSOVO_LOCATIONS: LocationEntry[] = [
  WAREHOUSE_LOCATION,

  // —— Prishtinë municipality ——
  { id: "prishtine-center", name: "Prishtinë — Qendra", city: "Prishtinë", region: "Prishtinë", type: "city", lat: 42.6627, lng: 21.1655, postalCode: "10000" },
  { id: "shkabaj", name: "Shkabaj", city: "Prishtinë", region: "Prishtinë", type: "village", lat: 42.67133, lng: 21.12447, postalCode: "10000" },
  { id: "hajvali", name: "Hajvali", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.61806, lng: 21.18083, postalCode: "10000" },
  { id: "matiqan", name: "Matiçan", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.6449, lng: 21.1918, postalCode: "10000" },
  { id: "dardania", name: "Dardania", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.648, lng: 21.178, postalCode: "10000" },
  { id: "ulpiana", name: "Ulpiana", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.655, lng: 21.185, postalCode: "10000" },
  { id: "dardani", name: "Dardani", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.651, lng: 21.172, postalCode: "10000" },
  { id: "bregu-i-diellit", name: "Bregu i Diellit", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.668, lng: 21.178, postalCode: "10000" },
  { id: "kalabri", name: "Kalabri", city: "Prishtinë", region: "Prishtinë", type: "district", lat: 42.658, lng: 21.148, postalCode: "10000" },
  { id: "village-industrial-prishtine", name: "Prishtinë — Zona Industriale", city: "Prishtinë", region: "Prishtinë", type: "industrial", lat: 42.635, lng: 21.155, postalCode: "10000" },
  { id: "badovc", name: "Badovc", city: "Prishtinë", region: "Prishtinë", type: "village", lat: 42.622, lng: 21.222, postalCode: "10000" },
  { id: "gracanice", name: "Graçanicë", city: "Graçanicë", region: "Prishtinë", type: "city", lat: 42.601, lng: 21.195, postalCode: "10500" },

  // —— Surrounding Prishtinë region ——
  { id: "fushë-kosove", name: "Fushë Kosovë", city: "Fushë Kosovë", region: "Fushë Kosovë", type: "city", lat: 42.637, lng: 21.093, postalCode: "12000" },
  { id: "obiliq", name: "Obiliq", city: "Obiliq", region: "Obiliq", type: "city", lat: 42.687, lng: 21.077, postalCode: "13000" },
  { id: "lipjan", name: "Lipjan", city: "Lipjan", region: "Lipjan", type: "city", lat: 42.53, lng: 21.1386, postalCode: "14000" },
  { id: "podujeve", name: "Podujevë", city: "Podujevë", region: "Podujevë", type: "city", lat: 42.9105, lng: 21.1911, postalCode: "11000" },
  { id: "drenas", name: "Drenas (Gllogoc)", city: "Drenas", region: "Gllogoc", type: "city", lat: 42.625, lng: 20.893, postalCode: "13000" },
  { id: "vushtrri", name: "Vushtrri", city: "Vushtrri", region: "Vushtrri", type: "city", lat: 42.823, lng: 20.967, postalCode: "42000" },
  { id: "mitrovice", name: "Mitrovicë", city: "Mitrovicë", region: "Mitrovicë", type: "city", lat: 42.8833, lng: 20.8667, postalCode: "40000" },
  { id: "mitrovice-norte", name: "Mitrovicë e Veriut", city: "Mitrovicë e Veriut", region: "Mitrovicë", type: "city", lat: 42.9, lng: 20.87, postalCode: "40000" },
  { id: "skenderaj", name: "Skenderaj", city: "Skenderaj", region: "Skenderaj", type: "city", lat: 42.745, lng: 20.789, postalCode: "41000" },

  // —— Ferizaj region ——
  { id: "ferizaj", name: "Ferizaj", city: "Ferizaj", region: "Ferizaj", type: "city", lat: 42.3667, lng: 21.1667, postalCode: "70000" },
  { id: "shtime", name: "Shtime", city: "Shtime", region: "Shtime", type: "city", lat: 42.433, lng: 21.039, postalCode: "72000" },
  { id: "hani-elezit", name: "Hani i Elezit", city: "Hani i Elezit", region: "Hani i Elezit", type: "city", lat: 42.15, lng: 21.296, postalCode: "71510" },
  { id: "kacanik", name: "Kaçanik", city: "Kaçanik", region: "Kaçanik", type: "city", lat: 42.231, lng: 21.259, postalCode: "71000" },

  // —— Gjilan region ——
  { id: "gjilan", name: "Gjilan", city: "Gjilan", region: "Gjilan", type: "city", lat: 42.4647, lng: 21.4669, postalCode: "60000" },
  { id: "kamenice", name: "Kamenicë", city: "Kamenicë", region: "Kamenicë", type: "city", lat: 42.578, lng: 21.575, postalCode: "62000" },
  { id: "novoberde", name: "Novobërdë", city: "Novobërdë", region: "Novobërdë", type: "city", lat: 42.616, lng: 21.418, postalCode: "61000" },
  { id: "partesh", name: "Partesh", city: "Partesh", region: "Partesh", type: "city", lat: 42.401, lng: 21.433, postalCode: "60000" },
  { id: "ranillug", name: "Ranillug", city: "Ranillug", region: "Ranillug", type: "city", lat: 42.492, lng: 21.598, postalCode: "62000" },

  // —— Prizren region ——
  { id: "prizren", name: "Prizren", city: "Prizren", region: "Prizren", type: "city", lat: 42.2139, lng: 20.7397, postalCode: "20000" },
  { id: "suhareke", name: "Suharekë", city: "Suharekë", region: "Suharekë", type: "city", lat: 42.359, lng: 20.825, postalCode: "23000" },
  { id: "rahovec", name: "Rahovec", city: "Rahovec", region: "Rahovec", type: "city", lat: 42.399, lng: 20.654, postalCode: "21000" },
  { id: "malisheve", name: "Malishevë", city: "Malishevë", region: "Malishevë", type: "city", lat: 42.482, lng: 20.745, postalCode: "24000" },
  { id: "dragash", name: "Dragash", city: "Dragash", region: "Dragash", type: "city", lat: 42.062, lng: 20.653, postalCode: "22000" },

  // —— Pejë region ——
  { id: "peje", name: "Pejë", city: "Pejë", region: "Pejë", type: "city", lat: 42.6603, lng: 20.2917, postalCode: "30000" },
  { id: "istog", name: "Istog", city: "Istog", region: "Istog", type: "city", lat: 42.781, lng: 20.487, postalCode: "31000" },
  { id: "kline", name: "Klinë", city: "Klinë", region: "Klinë", type: "city", lat: 42.621, lng: 20.577, postalCode: "32000" },
  { id: "decan", name: "Deçan", city: "Deçan", region: "Deçan", type: "city", lat: 42.54, lng: 20.288, postalCode: "51000" },
  { id: "junik", name: "Junik", city: "Junik", region: "Junik", type: "city", lat: 42.475, lng: 20.277, postalCode: "51000" },

  // —— Gjakovë region ——
  { id: "gjakove", name: "Gjakovë", city: "Gjakovë", region: "Gjakovë", type: "city", lat: 42.3833, lng: 20.4333, postalCode: "50000" },
  { id: "rahovec-gjakove", name: "Orahovac", city: "Rahovec", region: "Rahovec", type: "city", lat: 42.399, lng: 20.654, postalCode: "21000" },

  // —— North ——
  { id: "leposaviq", name: "Leposaviq", city: "Leposaviq", region: "Leposaviq", type: "city", lat: 43.103, lng: 20.803, postalCode: "43500" },
  { id: "zubin-potok", name: "Zubin Potok", city: "Zubin Potok", region: "Zubin Potok", type: "city", lat: 42.914, lng: 20.689, postalCode: "43000" },
  { id: "zvecan", name: "Zveçan", city: "Zveçan", region: "Zveçan", type: "city", lat: 42.915, lng: 20.84, postalCode: "43000" },

  // —— Commercial / industrial hubs ——
  { id: "prishtine-wholesale", name: "Prishtinë — Tregti (Wholesale)", city: "Prishtinë", region: "Prishtinë", type: "commercial", lat: 42.648, lng: 21.142, postalCode: "10000" },
  { id: "ferizaj-industrial", name: "Ferizaj — Zona Industriale", city: "Ferizaj", region: "Ferizaj", type: "industrial", lat: 42.355, lng: 21.145, postalCode: "70000" },
  { id: "prizren-industrial", name: "Prizren — Zona Industriale", city: "Prizren", region: "Prizren", type: "industrial", lat: 42.225, lng: 20.765, postalCode: "20000" },
];

/** All 38 Kosovo municipalities for filters */
export const KOSOVO_MUNICIPALITIES = [
  "Prishtinë",
  "Prizren",
  "Pejë",
  "Gjakovë",
  "Gjilan",
  "Ferizaj",
  "Mitrovicë",
  "Gllogoc",
  "Skenderaj",
  "Vushtrri",
  "Podujevë",
  "Obiliq",
  "Fushë Kosovë",
  "Lipjan",
  "Novobërdë",
  "Rahovec",
  "Suharekë",
  "Malishevë",
  "Kamenicë",
  "Viti",
  "Deçan",
  "Istog",
  "Klinë",
  "Dragash",
  "Leposaviq",
  "Zubin Potok",
  "Zveçan",
  "Junik",
  "Hani i Elezit",
  "Mamushë",
  "Partesh",
  "Ranillug",
  "Kllokot",
  "Graçanicë",
  "Shtime",
  "Kaçanik",
] as const;
