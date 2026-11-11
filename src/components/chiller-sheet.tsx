"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { PresetChips, volumePresets, volumeToMl } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/decimal-input";
import { Input } from "@/components/ui/input";
import { ChoiceButtons, OptionSheet } from "@/components/option-sheet";
import { useWhen, WhenField } from "@/components/when-field";
import { useI18n } from "@/i18n/provider";
import { parseDecimal } from "@/lib/decimal";
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
  const { locale, t } = useI18n();
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
  const { when, setWhen } = useWhen();

  const onlyPump = pumps.length === 1 ? pumps[0].id : "";
  const selectedPump = pumps.some((pump) => pump.id === pumpId) ? pumpId : onlyPump;
  const milkAmount = parseDecimal(milkMl);
  const milkReady = milkAmount !== null && milkAmount > 0;

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

  async function storeMilk() {
    if (lock.current || milkAmount === null || milkAmount <= 0) return;
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
        storedAt: when.toISOString(),
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
        storedAt: when.toISOString(),
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
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void storeMilk();
            }}
          >
            <div className="flex flex-col gap-4">
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
              <DecimalInput locale={locale} id="sheet-milk-ml" value={milkMl} onValueChange={setMilkMl} />
          </label>
          <PresetChips values={volumePresets(unit)} onPick={(value) => setMilkMl(String(value))} />
          <ChoiceButtons
            label={t("pump.location")}
            value={location}
            options={LOCATIONS.map((option) => ({ value: option, label: t(`chiller.${option}`) }))}
            onChange={(value) => {
              if (value === "fridge" || value === "freezer" || value === "cooler") setLocation(value);
            }}
          />
            <OptionSheet
              id="sheet-milk-baby"
              label={`${t("chiller.baby")} · ${t("chiller.noteOptional")}`}
              value={milkBabyId || "none"}
              options={[
                { value: "none", label: t("chiller.babyNone") },
                ...babies.map((baby) => ({ value: baby.id, label: baby.name })),
              ]}
              onChange={(value) => setMilkBabyId(value === "none" ? "" : value)}
            />
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="sheet-milk-note">
              {t("chiller.note")}
              <span className="font-normal text-muted"> · {t("chiller.noteOptional")}</span>
              <Input
                id="sheet-milk-note"
                value={milkNote}
                onChange={(event) => setMilkNote(event.target.value)}
              />
            </label>
            </div>
            <WhenField when={when} onChange={setWhen} />
          </form>
        ) : null}

        {step === "parts" ? (
          <form
            id="chiller-parts"
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void storeParts();
            }}
          >
            <div className="flex flex-col gap-4">
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
              <OptionSheet
                id="sheet-pump"
                label={t("pump.pickPump")}
                value={selectedPump}
                searchable={pumps.length > 8}
                options={pumps.map((pump) => ({ value: pump.id, label: pump.label }))}
                onChange={setPumpId}
              />
            )}
            {selectedPump && activePartPumpIds.includes(selectedPump) ? (
              <p className="text-sm text-muted">{t("chiller.replacesExisting")}</p>
            ) : null}
            </div>
            <WhenField when={when} onChange={setWhen} />
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
