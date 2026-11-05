"use client";

import { useEffect } from "react";
import { flushOfflineQueue } from "@/lib/save-log";

export function SyncQueue() {
  useEffect(() => {
    const flush = () => {
      void flushOfflineQueue();
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  return null;
}
