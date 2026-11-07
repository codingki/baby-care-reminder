"use client";

import { useEffect } from "react";
import { saveDeviceTimeZone } from "@/lib/device-timezone";
import { loadFamilyContext } from "@/lib/family-context";

export function SyncDeviceTimezone() {
  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) return;
      await saveDeviceTimeZone(context.userId, context.familyId);
    })();
  }, []);

  return null;
}
