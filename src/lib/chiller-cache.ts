"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { loadLiveChiller, type ClearReason, type LiveChillerItem } from "@/lib/chiller-live";
import { createClient } from "@/lib/supabase/client";

export type ChillerCache = {
  items: LiveChillerItem[];
  babyCount: number;
};

export function chillerKey(familyId: string) {
  return ["chiller", familyId] as const;
}

export function useLiveChiller(familyId: string | null | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: familyId ? chillerKey(familyId) : ["chiller", "pending"],
    enabled: Boolean(familyId),
    queryFn: () => loadLiveChiller(),
  });

  useEffect(() => {
    if (!familyId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chiller-items:${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chiller_items",
          filter: `family_id=eq.${familyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: chillerKey(familyId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId, queryClient]);

  return query;
}

export function invalidateChiller(client: QueryClient, familyId: string | null | undefined) {
  if (!familyId) return Promise.resolve();
  return client.invalidateQueries({ queryKey: chillerKey(familyId) });
}

export function updateChillerItems(
  client: QueryClient,
  familyId: string | null | undefined,
  recipe: (items: LiveChillerItem[]) => LiveChillerItem[],
) {
  if (!familyId) return;
  client.setQueryData<ChillerCache | null>(chillerKey(familyId), (current) => {
    if (!current) return current;
    return { ...current, items: recipe(current.items) };
  });
}

export function clearChillerItem(
  client: QueryClient,
  familyId: string | null | undefined,
  id: string,
  clearedAt: string,
  reason: ClearReason,
) {
  updateChillerItems(client, familyId, (items) =>
    items.map((item) => (item.id === id ? { ...item, clearedAt, clearedReason: reason } : item)),
  );
}

export function restoreChillerCache(client: QueryClient, familyId: string | null | undefined, ids: string[]) {
  const idSet = new Set(ids);
  updateChillerItems(client, familyId, (items) =>
    items.map((item) => (idSet.has(item.id) ? { ...item, clearedAt: null, clearedReason: null } : item)),
  );
}

export function dropChillerItem(client: QueryClient, familyId: string | null | undefined, id: string) {
  let removed: LiveChillerItem | null = null;
  if (!familyId) return null;
  client.setQueryData<ChillerCache | null>(chillerKey(familyId), (current) => {
    if (!current) return current;
    removed = current.items.find((item) => item.id === id) ?? null;
    return { ...current, items: current.items.filter((item) => item.id !== id) };
  });
  return removed;
}

export function upsertChillerItem(client: QueryClient, familyId: string | null | undefined, item: LiveChillerItem) {
  updateChillerItems(client, familyId, (items) => [item, ...items.filter((entry) => entry.id !== item.id)]);
}
