"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { PresetChips, volumePresets, volumeToMl } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  babies,
  defaultBabyId = "",
  activePartPumpIds = [],
  onClose,
  onSaved,
}: {
  open: boolean;
  pumps: SheetPump[];
  babies: { id: string; name: string }[];
  defaultBabyId?: string;
  activePartPumpIds?: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const lock = useRef(false);
  const [step, setStep] = useState<Step>("choose");
  const [pending, setPending] = useState(false);
  const [milkMl, setMilkMl] = useState("");
  const [milkNote, setMilkNote] = useState("");
  const [location, setLocation] = useState<(typeof LOCATIONS)[number]>("fridge");
  const [pumpId, setPumpId] = useState<string>("");
  const [milkBabyId, setMilkBabyId] = useState(defaultBabyId);
  const [status, setStatus] = useState<string | null>(null);
  const [unit, setUnit] = useState("ml");

  const onlyPump = pumps.length === 1 ? pumps[0].id : "";
  const selectedPump = pumps.some((pump) => pump.id === pumpId) ? pumpId : onlyPump;
  const milkAmount = Number(milkMl);
  const milkReady = Number.isFinite(milkAmount) && milkAmount > 0;

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

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
        babyId: milkBabyId || null,
      });
      if (saved.status === "error") {
        setStatus(t("common.failed"));
        return;
      }
      await onSaved();
      onClose();
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
      if (activePartPumpIds.includes(selectedPump)) toast(t("chiller.partsUpdated"));
      await onSaved();
      onClose();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <>
        <div className="safe-x min-h-0 overflow-y-auto overscroll-contain pt-1 pb-4">

        {step === "choose" ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStatus(null);
                setStep("milk");
              }}
              className="h-auto min-h-16 w-full justify-start gap-3 rounded-2xl bg-[#f3f5f3] px-4 text-left whitespace-normal text-base text-foreground"
            >
              <CareIcon name="feed" className="h-6 w-6 text-accent" />
              <span className="text-base font-semibold">{t("home.storeMilk")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStatus(null);
                setStep("parts");
              }}
              className="h-auto min-h-16 w-full justify-start gap-3 rounded-2xl bg-[#f3f5f3] px-4 text-left whitespace-normal text-base text-foreground"
            >
              <CareIcon name="pump" className="h-6 w-6 text-accent" />
              <span className="text-base font-semibold">{t("home.storeParts")}</span>
            </Button>
            <Link href="/chiller" onClick={onClose} className="text-sm font-semibold text-accent">
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
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setStep("choose")}
              className="h-auto min-h-0 self-start px-0 text-sm"
            >
              {t("common.back")}
            </Button>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CareIcon name="feed" className="h-4 w-4 text-accent" />
              {t("home.storeMilk")}
            </h3>
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-ml">
              {t("pump.milkAmount")}
              <Input
                id="sheet-milk-ml"
                type="number"
                inputMode="decimal"
                min={1}
                value={milkMl}
                onChange={(event) => setMilkMl(event.target.value)}
              />
          </label>
          <PresetChips values={volumePresets(unit)} onPick={(value) => setMilkMl(String(value))} />
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-where">
              {t("pump.location")}
              <Select
                value={location}
                onValueChange={(value) => {
                  if (value === "fridge" || value === "freezer" || value === "cooler") setLocation(value);
                }}
              >
                <SelectTrigger id="sheet-milk-where">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`chiller.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-baby">
              {t("chiller.baby")}
              <span className="font-normal text-muted"> · {t("chiller.noteOptional")}</span>
              <Select value={milkBabyId || "none"} onValueChange={(value) => setMilkBabyId(value === "none" ? "" : value)}>
                <SelectTrigger id="sheet-milk-baby">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("chiller.babyNone")}</SelectItem>
                  {babies.map((baby) => (
                    <SelectItem key={baby.id} value={baby.id}>
                      {baby.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-note">
              {t("chiller.note")}
              <span className="font-normal text-muted"> · {t("chiller.noteOptional")}</span>
              <Input
                id="sheet-milk-note"
                value={milkNote}
                onChange={(event) => setMilkNote(event.target.value)}
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
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setStep("choose")}
              className="h-auto min-h-0 self-start px-0 text-sm"
            >
              {t("common.back")}
            </Button>
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
                <Select value={selectedPump || undefined} onValueChange={setPumpId}>
                  <SelectTrigger id="sheet-pump">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pumps.map((pump) => (
                      <SelectItem key={pump.id} value={pump.id}>
                        {pump.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            {selectedPump && activePartPumpIds.includes(selectedPump) ? (
              <p className="text-sm text-muted">{t("chiller.replacesExisting")}</p>
            ) : null}
          </form>
        ) : null}

        {step === "choose" && status ? (
          <p role="status" className="mt-3 text-sm">
            {status}
          </p>
        ) : null}
        </div>
        {step === "milk" || step === "parts" ? (
          <div className="safe-x shrink-0 border-t border-line bg-background pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {status ? (
              <p role="status" className="pb-2 text-sm">
                {status}
              </p>
            ) : null}
            {step === "milk" ? (
              <Button type="submit" form="chiller-milk" disabled={pending || !milkReady} aria-busy={pending}>
                {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
              </Button>
            ) : (
              <Button type="submit" form="chiller-parts" disabled={pending || !selectedPump} aria-busy={pending}>
                {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
              </Button>
            )}
          </div>
        ) : null}
    </>
  );
}
