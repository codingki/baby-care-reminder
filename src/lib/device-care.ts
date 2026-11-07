import { findCatalogPump } from "@/lib/pump-catalog";

export const CHILLER_LOCATIONS = ["room", "fridge", "freezer", "cooler", "thawed", "leftover"] as const;

export type ChillerLocation = (typeof CHILLER_LOCATIONS)[number];

export type OwnedPump = {
  id: string;
  catalogId: string | null;
  brand: string | null;
  model: string | null;
  customName: string | null;
  nickname: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type ChillerItem = {
  id: string;
  type: "milk" | "pump_parts";
  location: ChillerLocation;
  storedAt: string;
  expiresAt: string;
  pumpId: string | null;
  volumeMl: number | null;
  note?: string | null;
  clearedAt?: string | null;
  clearedReason?: "used" | "discarded" | "washed" | "replaced" | null;
};

export type CareState = {
  pumps: OwnedPump[];
  washByHours: number;
  partsDisclaimerSeen: boolean;
  items: ChillerItem[];
};

const STORAGE_KEY = "bcr_care_device_v1";

const MILK_STORAGE_HOURS: Record<ChillerLocation, number> = {
  room: 4,
  fridge: 24 * 4,
  freezer: 24 * 182,
  cooler: 24,
  thawed: 24,
  leftover: 2,
};

const listeners = new Set<() => void>();

export const emptyCareState: CareState = {
  pumps: [],
  washByHours: 24,
  partsDisclaimerSeen: false,
  items: [],
};

let cachedState: CareState = emptyCareState;
let cacheLoaded = false;

export function clampWashByHours(value: number): number {
  if (!Number.isFinite(value)) return 24;
  return Math.min(24, Math.max(1, Math.round(value)));
}

export function pumpLabel(pump: OwnedPump): string {
  const base = pump.customName ?? [pump.brand, pump.model].filter(Boolean).join(" ");
  if (pump.nickname) return `${pump.nickname} · ${base}`;
  return base;
}

export function defaultPumpId(pumps: OwnedPump[]): string | null {
  if (pumps.length === 0) return null;
  const ranked = [...pumps].sort((left, right) => {
    const leftUsed = left.lastUsedAt ?? "";
    const rightUsed = right.lastUsedAt ?? "";
    if (leftUsed !== rightUsed) return leftUsed < rightUsed ? 1 : -1;
    return left.createdAt < right.createdAt ? 1 : -1;
  });
  return ranked[0]?.id ?? null;
}

export function milkExpiresAt(storedAt: Date, location: ChillerLocation): Date {
  return new Date(storedAt.getTime() + MILK_STORAGE_HOURS[location] * 60 * 60 * 1000);
}

export function partsExpiresAt(storedAt: Date, washByHours: number): Date {
  return new Date(storedAt.getTime() + clampWashByHours(washByHours) * 60 * 60 * 1000);
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeCare(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isLocation(value: unknown): value is ChillerLocation {
  return typeof value === "string" && CHILLER_LOCATIONS.some((location) => location === value);
}

function readCare(): CareState {
  if (typeof window === "undefined") return emptyCareState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCareState;
    const parsed = JSON.parse(raw) as Partial<CareState>;
    return {
      pumps: Array.isArray(parsed.pumps) ? parsed.pumps.filter(isPump) : [],
      washByHours: clampWashByHours(Number(parsed.washByHours)),
      partsDisclaimerSeen: parsed.partsDisclaimerSeen === true,
      items: Array.isArray(parsed.items) ? parsed.items.filter(isItem) : [],
    };
  } catch {
    return emptyCareState;
  }
}

function isPump(value: unknown): value is OwnedPump {
  if (typeof value !== "object" || value === null) return false;
  const pump = value as Partial<OwnedPump>;
  return typeof pump.id === "string" && typeof pump.createdAt === "string";
}

function isItem(value: unknown): value is ChillerItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<ChillerItem>;
  return (
    typeof item.id === "string" &&
    (item.type === "milk" || item.type === "pump_parts") &&
    isLocation(item.location) &&
    typeof item.storedAt === "string" &&
    typeof item.expiresAt === "string"
  );
}

function writeCare(next: CareState) {
  cachedState = next;
  cacheLoaded = true;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
}

export function getCareState(): CareState {
  if (typeof window === "undefined") return emptyCareState;
  if (!cacheLoaded) {
    cachedState = readCare();
    cacheLoaded = true;
  }
  return cachedState;
}

export function markPumpUsed(id: string) {
  const current = readCare();
  const usedAt = new Date().toISOString();
  writeCare({
    ...current,
    pumps: current.pumps.map((pump) =>
      pump.id === id ? { ...pump, lastUsedAt: usedAt } : pump,
    ),
  });
}

export function setWashByHours(hours: number) {
  const current = readCare();
  writeCare({ ...current, washByHours: clampWashByHours(hours) });
}

export function markPartsDisclaimerSeen() {
  const current = readCare();
  if (current.partsDisclaimerSeen) return;
  writeCare({ ...current, partsDisclaimerSeen: true });
}

export function addOwnedPump(input: {
  catalogId: string | null;
  customName: string;
  nickname: string;
}): OwnedPump | null {
  const nickname = input.nickname.trim();
  const customName = input.customName.trim();
  const catalog = input.catalogId ? findCatalogPump(input.catalogId) : null;
  if (!catalog && customName.length === 0) return null;

  const pump: OwnedPump = {
    id: crypto.randomUUID(),
    catalogId: catalog?.id ?? null,
    brand: catalog?.brand ?? null,
    model: catalog?.model ?? null,
    customName: catalog ? null : customName,
    nickname: nickname.length > 0 ? nickname : null,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  const current = readCare();
  writeCare({ ...current, pumps: [pump, ...current.pumps] });
  return pump;
}

export function removeOwnedPump(id: string) {
  const current = readCare();
  writeCare({ ...current, pumps: current.pumps.filter((pump) => pump.id !== id) });
}

export function replacePumps(pumps: OwnedPump[]) {
  const current = readCare();
  writeCare({ ...current, pumps });
}

export function markChillerRestored(id: string) {
  const current = readCare();
  writeCare({
    ...current,
    items: current.items.map((item) =>
      item.id === id ? { ...item, clearedAt: null, clearedReason: null } : item,
    ),
  });
}

export function markChillerCleared(
  id: string,
  clearedAt: string,
  clearedReason: "used" | "discarded" | "washed" | "replaced",
) {
  const current = readCare();
  writeCare({
    ...current,
    items: current.items.map((item) =>
      item.id === id ? { ...item, clearedAt, clearedReason } : item,
    ),
  });
}

export function replaceStoredPumpParts(pumpId: string, clearedAt: string) {
  const current = readCare();
  writeCare({
    ...current,
    items: current.items.map((item) =>
      item.type === "pump_parts" && item.pumpId === pumpId && !item.clearedAt
        ? { ...item, clearedAt, clearedReason: "replaced" }
        : item,
    ),
  });
}

export function rememberChillerItem(item: ChillerItem) {
  const current = readCare();
  writeCare({
    ...current,
    items: [item, ...current.items.filter((entry) => entry.id !== item.id)],
  });
}

export function addChillerItems(input: {
  storeParts: boolean;
  pumpId: string | null;
  saveMilk: boolean;
  volumeMl: number | null;
  milkLocation: ChillerLocation;
}): ChillerItem[] {
  const current = readCare();
  const storedAt = new Date();
  const created: ChillerItem[] = [];

  if (input.storeParts && input.pumpId && current.pumps.some((pump) => pump.id === input.pumpId)) {
    const expiresAt = partsExpiresAt(storedAt, current.washByHours);
    created.push({
      id: crypto.randomUUID(),
      type: "pump_parts",
      location: "fridge",
      storedAt: storedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      pumpId: input.pumpId,
      volumeMl: null,
    });
  }

  if (input.saveMilk) {
    const expiresAt = milkExpiresAt(storedAt, input.milkLocation);
    created.push({
      id: crypto.randomUUID(),
      type: "milk",
      location: input.milkLocation,
      storedAt: storedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      pumpId: null,
      volumeMl: input.volumeMl,
    });
  }

  if (created.length === 0) return [];

  const parts = created.find((item) => item.type === "pump_parts");
  writeCare({
    ...current,
    partsDisclaimerSeen: current.partsDisclaimerSeen || Boolean(parts),
    pumps: current.pumps.map((pump) =>
      parts && pump.id === parts.pumpId ? { ...pump, lastUsedAt: parts.storedAt } : pump,
    ),
    items: [...created, ...current.items],
  });
  return created;
}

export function findChillerItem(id: string): ChillerItem | null {
  return readCare().items.find((item) => item.id === id) ?? null;
}
