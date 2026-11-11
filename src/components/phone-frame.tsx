"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { bindAppFrame } from "@/components/ui/use-app-frame";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = ref.current;
    const viewport = window.visualViewport;
    const release = () => {
      if (frame) {
        frame.style.height = "";
        frame.style.top = "";
      }
      if (document.querySelector("[data-slot='dialog-content'][data-state='open']")) return;
      const body = document.body;
      body.style.removeProperty("overflow");
      body.style.removeProperty("position");
      body.style.removeProperty("top");
      body.style.removeProperty("left");
      body.style.removeProperty("right");
      body.style.removeProperty("width");
      body.style.removeProperty("padding-right");
      body.removeAttribute("data-scroll-locked");
    };
    const onBlur = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      window.setTimeout(release, 50);
      window.setTimeout(release, 350);
    };
    document.addEventListener("focusout", onBlur);
    viewport?.addEventListener("resize", release);
    return () => {
      document.removeEventListener("focusout", onBlur);
      viewport?.removeEventListener("resize", release);
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
      className="fixed inset-x-0 top-0 z-10 mx-auto flex h-dvh min-h-[100svh] w-full min-w-0 max-w-none flex-col overflow-x-hidden rounded-none bg-background sm:max-w-md sm:shadow-[0_0_0_1px_var(--line)]"
    >
      {children}
      <Toaster />
    </div>
  );
}

function isField(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches("input, textarea, select");
}
