import { createClient } from "@/lib/supabase/client";
import { chooseBaby } from "@/lib/selected-baby";

export type FamilyContext = {
  userId: string;
  familyId: string;
  babyId: string | null;
  babyName: string | null;
  washByHours: number;
  suggestedMl: number | null;
  unit: string;
};

export async function loadFamilyContext(): Promise<FamilyContext | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership?.family_id) return null;

  const [{ data: family }, { data: babies }] = await Promise.all([
    supabase
      .from("families")
      .select("pump_parts_wash_by_hours, unit")
      .eq("id", membership.family_id)
      .maybeSingle(),
    supabase
      .from("babies")
      .select("id, name, suggested_ml")
      .eq("family_id", membership.family_id)
      .order("created_at"),
  ]);

  const roster = babies ?? [];
  const selectedId = chooseBaby(
    membership.family_id,
    roster.flatMap((baby) => (typeof baby.id === "string" ? [baby.id] : [])),
  );
  const baby = roster.find((row) => row.id === selectedId) ?? null;
  return {
    userId,
    familyId: membership.family_id,
    babyId: baby?.id ?? null,
    babyName: typeof baby?.name === "string" ? baby.name : null,
    washByHours: family?.pump_parts_wash_by_hours ?? 24,
    suggestedMl: baby?.suggested_ml ?? null,
    unit: family?.unit === "oz" ? "oz" : "ml",
  };
}
