"use client";

import { useQuery, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { loadFamilyContext } from "@/lib/family-context";
import { rememberBaby } from "@/lib/selected-baby";

export type CareScope = {
  userId: string;
  familyId: string;
  babyId: string | null;
};

export const CARE_SCOPE_KEY = ["care-scope"] as const;

export function scopedKey(name: string, scope: CareScope | null | undefined, ...extra: unknown[]): QueryKey {
  return [name, scope?.userId ?? null, scope?.familyId ?? null, scope?.babyId ?? null, ...extra];
}

export function scopeFromKey(queryKey: QueryKey): CareScope {
  const userId = queryKey[1];
  const familyId = queryKey[2];
  const babyId = queryKey[3];
  if (typeof userId !== "string" || typeof familyId !== "string") {
    throw new Error("Missing care scope");
  }
  return { userId, familyId, babyId: typeof babyId === "string" ? babyId : null };
}

export async function fetchScope(): Promise<CareScope | null> {
  const context = await loadFamilyContext();
  if (!context) return null;
  return {
    userId: context.userId,
    familyId: context.familyId,
    babyId: context.babyId,
  };
}

export function useScope() {
  return useQuery({
    queryKey: CARE_SCOPE_KEY,
    queryFn: fetchScope,
  });
}

export function focusBaby(client: QueryClient, scope: CareScope, babyId: string) {
  rememberBaby(scope.familyId, babyId);
  client.setQueryData<CareScope | null>(CARE_SCOPE_KEY, (current) =>
    current ? { ...current, babyId } : { ...scope, babyId },
  );
}
