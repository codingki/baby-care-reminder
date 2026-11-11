"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { bindAppFrame } from "@/components/ui/use-app-frame";
import { applyKeyboardVars, scrollFocusedField, sheetIsOpen, syncPagePadding } from "@/lib/keyboard-inset";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = ref.current;
    let listening = false;
    let scrollTimer = 0;

    const onViewport = () => {
      applyKeyboardVars();
      syncPagePadding();
      if (sheetIsOpen()) scrollFocusedField();
    };

    const setListening = (on: boolean) => {
      const viewport = window.visualViewport;
      if (!viewport || on === listening) return;
      if (on) {
        viewport.addEventListener("resize", onViewport);
        viewport.addEventListener("scroll", onViewport);
      } else {
        viewport.removeEventListener("resize", onViewport);
        viewport.removeEventListener("scroll", onViewport);
      }
      listening = on;
    };

    const sync = () => {
      const typing = isField(document.activeElement);
      setListening(sheetIsOpen() || typing);
      applyKeyboardVars();
      syncPagePadding();
    };

    const unlockBody = () => {
      if (sheetIsOpen()) return;
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

    const onFocus = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      sync();
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(scrollFocusedField, 300);
    };

    const onBlur = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      window.setTimeout(() => {
        unlockBody();
        sync();
      }, 50);
    };

    const observer = new MutationObserver(sync);
    if (frame) {
      observer.observe(frame, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-state"],
      });
    }
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    sync();

    return () => {
      window.clearTimeout(scrollTimer);
      observer.disconnect();
      setListening(false);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.documentElement.style.setProperty("--kb", "0px");
      document.documentElement.style.removeProperty("--vvh");
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
