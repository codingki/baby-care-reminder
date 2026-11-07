"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { PresetChips, volumePresets, volumeToMl } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { useSheetPresence } from "@/components/sheet-presence";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { saveChillerItem } from "@/lib/save-log";

const LOCATIONS = ["fridge", "freezer", "cooler"] as const;

export type SheetPump = {
  id: string;
  label: string;
};

type Step = "choose" | "milk" | "parts";

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
  useSheetPresence(open);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const [step, setStep] = useState<Step>("choose");
  const [pending, setPending] = useState(false);
  const [milkMl, setMilkMl] = useState("");
  const [milkNote, setMilkNote] = useState("");
  const [location, setLocation] = useState<(typeof LOCATIONS)[number]>("fridge");
  const [pumpId, setPumpId] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [unit, setUnit] = useState("ml");

  const onlyPump = pumps.length === 1 ? pumps[0].id : "";
  const selectedPump = pumps.some((pump) => pump.id === pumpId) ? pumpId : onlyPump;
  const milkAmount = Number(milkMl);
  const milkReady = Number.isFinite(milkAmount) && milkAmount > 0;

  function reset() {
    setStep("choose");
    setPending(false);
    setMilkMl("");
    setMilkNote("");
    setLocation("fridge");
    setPumpId("");
    setStatus(null);
  }

  function close() {
    reset();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setStep("choose");
      setPending(false);
      setMilkMl("");
      setMilkNote("");
      setLocation("fridge");
      setPumpId("");
      setStatus(null);
      onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, step]);

  async function storeMilk() {
    if (lock.current || !milkReady) return;
    lock.current = true;
    setPending(true);
    setStatus(null);
    try {
      const context = await loadFamilyContext();
      const saved = await saveChillerItem({
        type: "milk",
        location,
        volumeMl: volumeToMl(milkAmount, unit),
        pumpId: null,
        washByHours: context?.washByHours ?? 24,
        note: milkNote,
      });
      if (saved.status === "error") {
        setStatus(t("common.failed"));
        return;
      }
      setMilkMl("");
      setMilkNote("");
      setStatus(saved.status === "queued" ? t("common.queued") : t("common.saved"));
      setStep("choose");
      onSaved();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function storeParts() {
    if (lock.current || !selectedPump) return;
    lock.current = true;
    setPending(true);
    setStatus(null);
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
        setStatus(t("common.failed"));
        return;
      }
      setStatus(saved.status === "queued" ? t("common.queued") : t("common.saved"));
      setStep("choose");
      onSaved();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  if (!open) return null;

  const frame = document.getElementById("app-frame");
  const saveClass =
    "min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50";
  const panel = (
    <div
      className="absolute inset-0 z-40 flex bg-background sm:items-end sm:justify-center sm:bg-black/30"
      onClick={close}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-none flex-col rounded-none bg-background sm:h-auto sm:max-h-[85dvh] sm:max-w-md sm:rounded-t-3xl sm:shadow-[0_0_0_1px_var(--line)]"
      >
        <div className="safe-x flex shrink-0 items-center justify-between gap-3 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:pt-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {t("chiller.title")}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t("home.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted"
          >
            <CareIcon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">

        {step === "choose" ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setStatus(null);
                setStep("milk");
              }}
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-[#f3f5f3] px-4 text-left"
            >
              <CareIcon name="feed" className="h-6 w-6 text-accent" />
              <span className="text-base font-semibold">{t("home.storeMilk")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus(null);
                setStep("parts");
              }}
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-[#f3f5f3] px-4 text-left"
            >
              <CareIcon name="pump" className="h-6 w-6 text-accent" />
              <span className="text-base font-semibold">{t("home.storeParts")}</span>
            </button>
            <Link href="/chiller" onClick={close} className="text-sm font-semibold text-accent">
              {t("home.chillerList")}
            </Link>
          </div>
        ) : null}

        {step === "milk" ? (
          <form
            id="chiller-milk"
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void storeMilk();
            }}
          >
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="self-start text-sm font-semibold text-accent"
            >
              {t("common.back")}
            </button>
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
          <PresetChips values={volumePresets(unit)} onPick={(value) => setMilkMl(String(value))} />
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
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-note">
              {t("chiller.note")}
              <span className="font-normal text-muted"> · {t("chiller.noteOptional")}</span>
              <input
                id="sheet-milk-note"
                value={milkNote}
                onChange={(event) => setMilkNote(event.target.value)}
                className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
              />
            </label>
          </form>
        ) : null}

        {step === "parts" ? (
          <form
            id="chiller-parts"
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void storeParts();
            }}
          >
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="self-start text-sm font-semibold text-accent"
            >
              {t("common.back")}
            </button>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CareIcon name="pump" className="h-4 w-4 text-accent" />
              {t("home.storeParts")}
            </h3>
            {pumps.length === 0 ? (
              <p className="text-sm leading-6">
                {t("pump.noPumps")}{" "}
                <Link href="/settings" className="font-semibold text-accent" onClick={close}>
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
                  {pumps.length === 1 ? null : <option value="" />}
                {pumps.map((pump) => (
                    <option key={pump.id} value={pump.id}>
                      {pump.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form>
        ) : null}

        {step === "choose" && status ? (
          <p role="status" className="mt-3 text-sm">
            {status}
          </p>
        ) : null}
        </div>
        {step === "milk" || step === "parts" ? (
          <div className="safe-x flex shrink-0 flex-col gap-2 border-t border-line bg-background pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-none sm:border-0">
            {status ? (
              <p role="status" className="text-sm">
                {status}
              </p>
            ) : null}
            {step === "milk" ? (
              <button
                type="submit"
                form="chiller-milk"
                disabled={pending || !milkReady}
                aria-busy={pending}
                className={saveClass}
              >
                {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
              </button>
            ) : (
              <button
                type="submit"
                form="chiller-parts"
                disabled={pending || !selectedPump}
                aria-busy={pending}
                className={saveClass}
              >
                {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!frame) return panel;
  return createPortal(panel, frame);
}
