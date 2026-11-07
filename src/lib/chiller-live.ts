import type { ChillerItem, ChillerLocation } from "@/lib/device-care";
import { CHILLER_LOCATIONS } from "@/lib/device-care";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

export type ClearReason = "used" | "discarded" | "washed";

export type LiveChillerItem = ChillerItem & {
  pumpName: string | null;
  babyId: string | null;
  babyName: string | null;
  clearedAt: string | null;
  clearedReason: ClearReason | null;
};

function isClearReason(value: unknown): value is ClearReason {
  return value === "used" || value === "discarded" || value === "washed";
}

function isLocation(value: string): value is ChillerLocation {
  return CHILLER_LOCATIONS.some((location) => location === value);
}

export async function loadLiveChiller(): Promise<{ items: LiveChillerItem[]; babyCount: number } | null> {
  const context = await loadFamilyContext();
  if (!context) return null;
  const supabase = createClient();
  const [{ data: items, error }, { data: pumps }, { data: models }, { data: babies }] = await Promise.all([
    supabase
      .from("chiller_items")
      .select("id, type, location, stored_at, expires_at, volume_ml, pump_id, note, cleared_at, cleared_reason, baby_id")
      .eq("family_id", context.familyId)
      .order("expires_at"),
    supabase
      .from("family_pumps")
      .select("id, nickname, custom_name, pump_model_id")
      .eq("family_id", context.familyId),
    supabase.from("pump_models").select("id, model"),
    supabase.from("babies").select("id, name").eq("family_id", context.familyId),
  ]);
  if (error || !items) return null;
  const babyCount = (babies ?? []).length;
  const pumpRows = pumps ?? [];
  const modelRows = models ?? [];
  return {
    babyCount,
    items: items.flatMap((item) => {
    if (item.type !== "milk" && item.type !== "pump_parts") return [];
    if (typeof item.location !== "string" || !isLocation(item.location)) return [];
    const pump = pumpRows.find((entry) => entry.id === item.pump_id);
    const model = modelRows.find((entry) => entry.id === pump?.pump_model_id);
    const pumpName = pump?.nickname || pump?.custom_name || model?.model || null;
    return [
      {
        id: item.id as string,
        type: item.type,
        location: item.location,
        storedAt: item.stored_at as string,
        expiresAt: item.expires_at as string,
        pumpId: (item.pump_id as string | null) ?? null,
        volumeMl: (item.volume_ml as number | null) ?? null,
        note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : null,
        clearedAt: typeof item.cleared_at === "string" ? item.cleared_at : null,
        clearedReason: isClearReason(item.cleared_reason) ? item.cleared_reason : null,
        pumpName,
        babyId: typeof item.baby_id === "string" ? item.baby_id : null,
        babyName:
          typeof item.baby_id === "string"
            ? ((babies ?? []).find((baby) => baby.id === item.baby_id)?.name ?? null)
            : null,
      },
    ];
  }),
  };
}
