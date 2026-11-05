export type CatalogPump = {
  id: string;
  brand: string;
  model: string;
};

// Mirrors the pump_models seed in the phase 0 migration.
export const PUMP_CATALOG: readonly CatalogPump[] = [
  { id: "medela-pump-in-style-maxflow", brand: "Medela", model: "Pump In Style MaxFlow" },
  { id: "medela-freestyle-flex", brand: "Medela", model: "Freestyle Flex" },
  { id: "medela-swing-maxi", brand: "Medela", model: "Swing Maxi" },
  { id: "medela-solo", brand: "Medela", model: "Solo" },
  { id: "medela-harmony", brand: "Medela", model: "Harmony" },
  { id: "momcozy-s12-pro", brand: "Momcozy", model: "S12 Pro" },
  { id: "momcozy-s9-pro", brand: "Momcozy", model: "S9 Pro" },
  { id: "momcozy-m5", brand: "Momcozy", model: "M5" },
  { id: "momcozy-m9", brand: "Momcozy", model: "M9" },
  { id: "momcozy-v1-pro", brand: "Momcozy", model: "V1 Pro" },
  { id: "momcozy-v2-pro", brand: "Momcozy", model: "V2 Pro" },
  { id: "momcozy-air-1", brand: "Momcozy", model: "Air 1" },
];

export function catalogByBrand(): { brand: string; pumps: CatalogPump[] }[] {
  const groups: { brand: string; pumps: CatalogPump[] }[] = [];
  for (const pump of PUMP_CATALOG) {
    const group = groups.find((item) => item.brand === pump.brand);
    if (group) {
      group.pumps.push(pump);
    } else {
      groups.push({ brand: pump.brand, pumps: [pump] });
    }
  }
  return groups;
}

export function findCatalogPump(id: string): CatalogPump | null {
  return PUMP_CATALOG.find((pump) => pump.id === id) ?? null;
}
