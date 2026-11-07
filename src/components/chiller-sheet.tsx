"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { saveChillerItem } from "@/lib/save-log";

const LOCATIONS = ["fridge", "freezer", "cooler"] as const;

export type SheetPump = {
  id: string;
  label: string;
};

export function ChillerSheet({
  open,
  pumps,
  onClose,
  onSaved,
}: {
  open: boolean;
  pumps: SheetPump[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const [pending, setPending] = useState<"milk" | "parts" | null>(null);
  const [milkMl, setMilkMl] = useState("");
  const [location, setLocation] = useState<(typeof LOCATIONS)[number]>("fridge");
  const [pumpId, setPumpId] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);

  const selectedPump = pumps.some((pump) => pump.id === pumpId) ? pumpId : (pumps[0]?.id ?? "");
  const milkAmount = Number(milkMl);
  const milkReady = Number.isFinite(milkAmount) && milkAmount > 0;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("input, select, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function storeMilk() {
    if (lock.current || !milkReady) return;
    lock.current = true;
    setPending("milk");
    setNote(null);
    try {
      const context = await loadFamilyContext();
      const saved = await saveChillerItem({
        type: "milk",
        location,
        volumeMl: Math.round(milkAmount),
        pumpId: null,
        washByHours: context?.washByHours ?? 24,
      });
      if (saved.status === "error") {
        setNote(t("common.failed"));
        return;
      }
      setMilkMl("");
      setNote(saved.status === "queued" ? t("common.queued") : t("common.saved"));
      onSaved();
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function storeParts() {
    if (lock.current || !selectedPump) return;
    lock.current = true;
    setPending("parts");
    setNote(null);
    try {
      const context = await loadFamilyContext();
      const saved = await saveChillerItem({
        type: "pump_parts",
        location: "fridge",
        volumeMl: null,
        pumpId: selectedPump,
        washByHours: context?.washByHours ?? 24,
      });
      if (saved.status === "error") {
        setNote(t("common.failed"));
        return;
      }
      setNote(saved.status === "queued" ? t("common.queued") : t("common.saved"));
      onSaved();
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-background px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_0_0_1px_var(--line)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {t("chiller.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("home.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted"
          >
            <CareIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void storeMilk();
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CareIcon name="feed" className="h-4 w-4 text-accent" />
            {t("home.storeMilk")}
          </h3>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-ml">
            {t("pump.milkAmount")}
            <input
              id="sheet-milk-ml"
              type="number"
              inputMode="decimal"
              min={1}
              value={milkMl}
              onChange={(event) => setMilkMl(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-where">
            {t("pump.location")}
            <select
              id="sheet-milk-where"
              value={location}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "fridge" || value === "freezer" || value === "cooler") setLocation(value);
              }}
              className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
            >
              {LOCATIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`chiller.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending !== null || !milkReady}
            aria-busy={pending === "milk"}
            className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending === "milk" ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </button>
        </form>

        <form
          className="flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void storeParts();
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CareIcon name="pump" className="h-4 w-4 text-accent" />
            {t("home.storeParts")}
          </h3>
          {pumps.length === 0 ? (
            <p className="text-sm leading-6">
              {t("pump.noPumps")}{" "}
              <Link href="/settings" className="font-semibold text-accent" onClick={onClose}>
                {t("pump.addPumps")}
              </Link>
            </p>
          ) : (
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-pump">
              {t("pump.pickPump")}
              <select
                id="sheet-pump"
                value={selectedPump}
                onChange={(event) => setPumpId(event.target.value)}
                className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
              >
                {pumps.map((pump) => (
                  <option key={pump.id} value={pump.id}>
                    {pump.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            disabled={pending !== null || !selectedPump}
            aria-busy={pending === "parts"}
            className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending === "parts" ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </button>
        </form>

        <Link href="/chiller" onClick={onClose} className="text-sm font-semibold text-accent">
          {t("home.chillerList")}
        </Link>
        {note ? (
          <p role="status" className="text-sm">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
