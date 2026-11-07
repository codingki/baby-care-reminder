"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { bindAppFrame } from "@/components/ui/use-app-frame";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = ref.current;
    const viewport = window.visualViewport;
    if (!frame || !viewport) return;

    const apply = () => {
      frame.style.height = `${viewport.height}px`;
      frame.style.top = `${viewport.offsetTop}px`;
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  useEffect(() => {
    const scrollActive = () => {
      const active = document.activeElement;
      if (!isField(active)) return;
      active.scrollIntoView({ block: "center", inline: "nearest" });
    };
    const onFocus = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      window.setTimeout(scrollActive, 50);
      window.setTimeout(scrollActive, 320);
    };
    document.addEventListener("focusin", onFocus);
    window.visualViewport?.addEventListener("resize", scrollActive);
    return () => {
      document.removeEventListener("focusin", onFocus);
      window.visualViewport?.removeEventListener("resize", scrollActive);
    };
  }, []);

  return (
    <div
      id="app-frame"
      ref={(node) => {
        ref.current = node;
        bindAppFrame(node);
      }}
      className="fixed inset-x-0 top-0 z-10 mx-auto flex h-dvh w-full max-w-none flex-col overflow-hidden rounded-none bg-background sm:max-w-md sm:shadow-[0_0_0_1px_var(--line)]"
    >
      {children}
      <Toaster />
    </div>
  );
}

function isField(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches("input, textarea, select");
}
