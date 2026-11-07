"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAnySheetOpen() {
  return useSyncExternalStore(subscribe, () => openCount > 0, () => false);
}

export function useSheetPresence(open: boolean) {
  useLayoutEffect(() => {
    if (!open) return;
    openCount += 1;
    emit();
    return () => {
      openCount -= 1;
      emit();
    };
  }, [open]);
}
