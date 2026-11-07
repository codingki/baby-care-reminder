"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Persister } from "@tanstack/query-persist-client-core";

export const QUERY_CACHE_BUSTER = "0.1.0-care-1";

let activeClient: QueryClient | null = null;
let activePersister: Persister | null = null;

export function createCareQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: () =>
          typeof document === "undefined" || document.visibilityState === "visible" ? 45_000 : false,
        refetchIntervalInBackground: false,
      },
    },
  });
}

export async function clearCareCache() {
  await activePersister?.removeClient();
  window.localStorage.removeItem("bcr-query-cache");
  activeClient?.clear();
  window.localStorage.removeItem("bcr-query-cache");
}

export function CareQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createCareQueryClient);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const persister = useMemo(() => {
    if (!mounted) return null;
    const next = createSyncStoragePersister({
      storage: window.localStorage,
      key: "bcr-query-cache",
    });
    return next;
  }, [mounted]);

  useEffect(() => {
    activeClient = client;
    activePersister = persister;
    const onVisible = () => {
      if (document.visibilityState === "visible") void client.invalidateQueries();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      activeClient = null;
      activePersister = null;
    };
  }, [client, persister]);

  if (!persister) return null;

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: QUERY_CACHE_BUSTER }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
