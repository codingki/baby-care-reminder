"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { bindAppFrame } from "@/components/ui/use-app-frame";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = ref.current;
    const viewport = window.visualViewport;
    const place = () => {
      if (!frame || !viewport) return;
      const offset = Math.max(0, viewport.offsetTop);
      const shorter = viewport.height < window.innerHeight - 1 || offset > 0;
      if (shorter) {
        frame.style.top = `${offset}px`;
        frame.style.height = `${viewport.height}px`;
        frame.style.setProperty("--sheet-vh", `${viewport.height}px`);
      } else {
        frame.style.top = "";
        frame.style.height = "";
        frame.style.removeProperty("--sheet-vh");
      }
    };
    const unlockBody = () => {
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
    const scrollActive = () => {
      const active = document.activeElement;
      if (!isField(active)) return;
      const scroller = active.closest("[data-slot='dialog-scroll']");
      if (scroller instanceof HTMLElement) {
        const field = active.getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        const delta = field.top - box.top - scroller.clientHeight / 2 + field.height / 2;
        scroller.scrollTop += delta;
        return;
      }
      active.scrollIntoView({ block: "center", inline: "nearest" });
    };
    const onFocus = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      window.setTimeout(scrollActive, 50);
      window.setTimeout(scrollActive, 320);
    };
    const onBlur = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      window.setTimeout(() => {
        unlockBody();
        place();
      }, 50);
    };
    place();
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("resize", scrollActive);
    viewport?.addEventListener("scroll", place);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", scrollActive);
      viewport?.removeEventListener("scroll", place);
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
