"use client";

import { useSyncExternalStore } from "react";
import { emptyCareState, getCareState, subscribeCare, type CareState } from "@/lib/device-care";

function getServerSnapshot(): CareState {
  return emptyCareState;
}

export function useCareStore(): CareState {
  return useSyncExternalStore(subscribeCare, getCareState, getServerSnapshot);
}
