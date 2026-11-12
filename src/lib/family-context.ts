"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getCareQueryClient } from "@/lib/query-provider";
import { chooseBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

export const FAMILY_CONTEXT_KEY = ["family-context"] as const;
export const FAMILY_CONTEXT_STALE_MS = 10 * 60 * 1000;

export type FamilyContext = {
  userId: string;
  familyId: string;
  babyId: string | null;
  babyName: string | null;
  washByHours: number;
  suggestedMl: number | null;
  unit: string;
};

export type FamilyBaby = {
  id: string;
  name: string;
  suggestedMl: number | null;
  feedMinutes: number | null;
  diaperMinutes: number | null;
};

export type FamilySnapshot = {
  userId: string;
  familyId: string;
  washByHours: number;
  unit: string;
  babies: FamilyBaby[];
  settings: {
    onboardingStep: number;
    timezone: string;
    language: string;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function babyList(value: unknown): FamilyBaby[] {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.flatMap((row) => {
    const baby = asRecord(row);
    if (!baby || typeof baby.id !== "string" || typeof baby.name !== "string") return [];
    return [
      {
        id: baby.id,
        name: baby.name,
        suggestedMl: typeof baby.suggested_ml === "number" ? baby.suggested_ml : null,
        feedMinutes: typeof baby.suggested_interval_minutes === "number" ? baby.suggested_interval_minutes : null,
        diaperMinutes: typeof baby.diaper_interval_minutes === "number" ? baby.diaper_interval_minutes : null,
      },
    ];
  });
}

export function toFamilyContext(snapshot: FamilySnapshot): FamilyContext {
  const babyId = chooseBaby(
    snapshot.familyId,
    snapshot.babies.map((baby) => baby.id),
  );
  const baby = snapshot.babies.find((row) => row.id === babyId) ?? null;
  return {
    userId: snapshot.userId,
    familyId: snapshot.familyId,
    babyId,
    babyName: baby?.name ?? null,
    washByHours: snapshot.washByHours,
    suggestedMl: baby?.suggestedMl ?? null,
    unit: snapshot.unit,
  };
}

export async function fetchFamilySnapshot(): Promise<FamilySnapshot | null> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("family_members")
    .select(
      `user_id, family_id,
       families ( pump_parts_wash_by_hours, unit, babies ( id, name, suggested_ml, suggested_interval_minutes, diaper_interval_minutes ) ),
       member_settings ( onboarding_step, timezone, language )`,
    )
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error || !data?.family_id) return null;

  const family = firstRecord(data.families);
  const settings = firstRecord(data.member_settings);
  const unit = family?.unit === "oz" || settings?.unit === "oz" ? "oz" : "ml";
  return {
    userId,
    familyId: data.family_id,
    washByHours: typeof family?.pump_parts_wash_by_hours === "number" ? family.pump_parts_wash_by_hours : 24,
    unit,
    babies: babyList(family?.babies),
    settings: settings
      ? {
          onboardingStep: typeof settings.onboarding_step === "number" ? settings.onboarding_step : 7,
          timezone: typeof settings.timezone === "string" ? settings.timezone : "UTC",
          language: typeof settings.language === "string" ? settings.language : "en",
        }
      : null,
  };
}

export async function loadFamilySnapshot(): Promise<FamilySnapshot | null> {
  const client = getCareQueryClient();
  if (!client) return fetchFamilySnapshot();
  const cached = client.getQueryData<FamilySnapshot | null>(FAMILY_CONTEXT_KEY);
  if (cached) return cached;
  return client.fetchQuery({
    queryKey: FAMILY_CONTEXT_KEY,
    queryFn: fetchFamilySnapshot,
    staleTime: FAMILY_CONTEXT_STALE_MS,
  });
}

export async function loadFamilyContext(): Promise<FamilyContext | null> {
  const snapshot = await loadFamilySnapshot();
  return snapshot ? toFamilyContext(snapshot) : null;
}

export function peekFamilyContext(): FamilyContext | null {
  const snapshot = getCareQueryClient()?.getQueryData<FamilySnapshot | null>(FAMILY_CONTEXT_KEY);
  return snapshot ? toFamilyContext(snapshot) : null;
}

export function invalidateFamilyContext(client?: QueryClient | null) {
  return (client ?? getCareQueryClient())?.invalidateQueries({ queryKey: FAMILY_CONTEXT_KEY });
}

export function useFamilyContext() {
  return useQuery({
    queryKey: FAMILY_CONTEXT_KEY,
    queryFn: fetchFamilySnapshot,
    staleTime: FAMILY_CONTEXT_STALE_MS,
    select: (snapshot) => (snapshot ? toFamilyContext(snapshot) : null),
  });
}
