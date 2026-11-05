import { findCatalogPump, PUMP_CATALOG } from "@/lib/pump-catalog";
import { loadFamilyContext } from "@/lib/family-context";
import { saveFamilyPump, removeFamilyPump } from "@/lib/save-log";
import type { OwnedPump } from "@/lib/device-care";
import { createClient } from "@/lib/supabase/client";

type ModelRow = { id: string; brand: string; model: string };

function catalogForModel(brand: string, model: string) {
  return PUMP_CATALOG.find((pump) => pump.brand === brand && pump.model === model) ?? null;
}

export async function loadRemotePumps(): Promise<OwnedPump[] | null> {
  const context = await loadFamilyContext();
  if (!context) return null;
  const supabase = createClient();
  const [{ data: pumps, error }, { data: models }] = await Promise.all([
    supabase
      .from("family_pumps")
      .select("id, pump_model_id, custom_name, nickname, created_at, last_used_at")
      .eq("family_id", context.familyId),
    supabase.from("pump_models").select("id, brand, model"),
  ]);
  if (error || !pumps) return null;
  const modelRows = (models ?? []) as ModelRow[];
  return pumps.map((pump) => {
    const model = modelRows.find((entry) => entry.id === pump.pump_model_id);
    const catalog = model ? catalogForModel(model.brand, model.model) : null;
    return {
      id: pump.id as string,
      catalogId: catalog?.id ?? null,
      brand: model?.brand ?? null,
      model: model?.model ?? null,
      customName: (pump.custom_name as string | null) ?? null,
      nickname: (pump.nickname as string | null) ?? null,
      createdAt: pump.created_at as string,
      lastUsedAt: (pump.last_used_at as string | null) ?? null,
    };
  });
}

export async function persistOwnedPump(pump: OwnedPump) {
  const context = await loadFamilyContext();
  if (!context) return "queued" as const;
  const supabase = createClient();
  const catalog = pump.catalogId ? findCatalogPump(pump.catalogId) : null;
  let pumpModelId: string | null = null;
  if (catalog) {
    const { data } = await supabase
      .from("pump_models")
      .select("id")
      .eq("brand", catalog.brand)
      .eq("model", catalog.model)
      .maybeSingle();
    pumpModelId = (data?.id as string | undefined) ?? null;
  }
  const customName = pumpModelId ? null : pump.customName ?? [pump.brand, pump.model].filter(Boolean).join(" ");
  return saveFamilyPump({
    id: pump.id,
    family_id: context.familyId,
    pump_model_id: pumpModelId,
    custom_name: customName && customName.length > 0 ? customName : null,
    nickname: pump.nickname,
  });
}

export async function deleteOwnedPump(id: string) {
  await removeFamilyPump(id);
}
