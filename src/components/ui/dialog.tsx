"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"
import { appFrameElement } from "@/components/ui/use-app-frame"

import { useSheetPresence } from "@/components/sheet-presence"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function outsideTarget(event: { target: EventTarget | null; detail?: { originalEvent?: Event } }) {
  const original = event.detail?.originalEvent?.target;
  return original instanceof Element ? original : event.target instanceof Element ? event.target : null;
}

function staysOpen(target: Element | null) {
  if (!target) return false;
  return Boolean(
    target.closest(
      "[data-slot='select-content'], [data-radix-popper-content-wrapper], [data-radix-select-viewport], [data-sonner-toaster], [data-sonner-toast], [role='listbox']",
    ),
  );
}

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return (
    <DialogPrimitive.Portal container={appFrameElement() ?? undefined} data-slot="dialog-portal" {...props} />
  )
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "absolute inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

function MarkSheetOpen() {
  useSheetPresence(true);
  return null;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const panel = React.useRef<HTMLDivElement>(null);
  const dismiss = React.useRef<HTMLButtonElement>(null);
  const drag = React.useRef<{ y: number; pointer: number; engaged: boolean } | null>(null);

  function keepPortal(event: { preventDefault: () => void; target: EventTarget | null; detail?: { originalEvent?: Event } }) {
    if (staysOpen(outsideTarget(event))) event.preventDefault();
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onPointerDownOutside={(event) => {
          keepPortal(event);
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          keepPortal(event);
          onInteractOutside?.(event);
        }}
        className={cn(
          "pointer-events-auto absolute inset-0 z-40 flex min-w-0 max-w-full items-end justify-center overflow-x-hidden outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom motion-reduce:animate-none sm:items-center sm:p-4 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-bottom-0",
          className
        )}
        {...props}
      >
        <DialogPrimitive.Close
          data-slot="dialog-backdrop"
          aria-label="Close"
          className="absolute inset-0"
        />
        <div
          ref={panel}
          data-slot="dialog-panel"
          className="pointer-events-auto relative z-10 flex h-auto max-h-[calc(var(--vvh,100dvh)-16px)] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-t-3xl bg-background text-base text-foreground shadow-[0_0_0_1px_var(--line)] sm:max-w-md sm:rounded-3xl"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest("input, textarea, select, button, a, label, [role='option']")) return;
            const scroll = target.closest("[data-slot='dialog-scroll']");
            const chrome = target.closest("[data-slot='dialog-handle'], [data-slot='dialog-header']");
            if (!chrome && !(scroll instanceof HTMLElement)) return;
            if (scroll instanceof HTMLElement && scroll.scrollTop > 1) return;
            drag.current = { y: event.clientY, pointer: event.pointerId, engaged: Boolean(chrome) };
            if (chrome) event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointer !== event.pointerId || !panel.current) return;
            const delta = event.clientY - active.y;
            if (!active.engaged) {
              if (delta < 12) return;
              const scroll = panel.current.querySelector("[data-slot='dialog-scroll']");
              if (scroll instanceof HTMLElement && scroll.scrollTop > 1) {
                drag.current = null;
                return;
              }
              active.engaged = true;
              panel.current.setPointerCapture(event.pointerId);
            }
            const next = Math.max(0, delta);
            panel.current.style.transform = next ? `translateY(${next}px)` : "";
          }}
          onPointerUp={(event) => {
            const active = drag.current;
            if (!active || active.pointer !== event.pointerId) return;
            drag.current = null;
            const distance = event.clientY - active.y;
            if (panel.current) panel.current.style.transform = "";
            if (active.engaged && distance > 72) dismiss.current?.click();
          }}
          onPointerCancel={() => {
            drag.current = null;
            if (panel.current) panel.current.style.transform = "";
          }}
        >
          <MarkSheetOpen />
          <div data-slot="dialog-handle" className="flex shrink-0 touch-none justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden">{children}</div>
          <DialogPrimitive.Close ref={dismiss} className="sr-only">
            Close
          </DialogPrimitive.Close>
          {showCloseButton && (
            <DialogPrimitive.Close data-slot="dialog-close" asChild>
              <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
