"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAnySheetOpen } from "@/components/sheet-presence";

export function PullToRefresh({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const client = useQueryClient();
  const sheetOpen = useAnySheetOpen();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const sheetRef = useRef(sheetOpen);
  useEffect(() => {
    sheetRef.current = sheetOpen;
  }, [sheetOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startY = 0;
    let tracking = false;

    const start = (event: TouchEvent) => {
      if (sheetRef.current || document.querySelector("[data-slot='dialog-content'][data-state='open']")) return;
      if (el.scrollTop > 0) return;
      startY = event.touches[0]?.clientY ?? 0;
      tracking = true;
    };
    const move = (event: TouchEvent) => {
      if (!tracking) return;
      if (el.scrollTop > 0) {
        tracking = false;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const next = (event.touches[0]?.clientY ?? startY) - startY;
      if (next <= 0) return;
      const shown = Math.min(64, next * 0.5);
      pullRef.current = shown;
      setPull(shown);
      if (next > 12 && event.cancelable) event.preventDefault();
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      const distance = pullRef.current;
      pullRef.current = 0;
      setPull(0);
      if (distance > 48) {
        setRefreshing(true);
        void client.refetchQueries({ type: "active" }).finally(() => setRefreshing(false));
      }
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
    };
  }, [client, scrollRef]);

  if (pull <= 0 && !refreshing) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
      <span
        className={`h-4 w-4 rounded-full border-2 border-accent border-t-transparent ${refreshing || pull > 48 ? "animate-spin" : ""}`}
        role="status"
        aria-label="Refreshing"
      />
    </div>
  );
}
