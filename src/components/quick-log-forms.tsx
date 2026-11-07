"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { MINUTE_PRESETS, PresetChips, volumePresets, volumeToMl } from "@/components/preset-chips";
import { PartsDisclaimer } from "@/components/parts-disclaimer";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { toWhenInput, WhenField, useWhen } from "@/components/when-field";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSaveLock } from "@/components/use-save-lock";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { loadFamilyContext } from "@/lib/family-context";
import { saveChillerItem, saveLog } from "@/lib/save-log";
import {
  CHILLER_LOCATIONS,
  markPumpUsed,
  partsExpiresAt,
  pumpLabel,
  type ChillerLocation,
} from "@/lib/device-care";
import { createClient } from "@/lib/supabase/client";

type LogResult = "synced" | "queued" | "error" | "needs-family";

function todayInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function finishLog(
  result: LogResult,
  t: (key: "common.failed") => string,
  router: { push: (href: string) => void },
  setMessage: (message: string) => void,
  onSaved: () => Promise<void>,
  onClose: () => void,
) {
  if (result === "needs-family") {
    onClose();
    router.push("/onboarding");
    return;
  }
  if (result === "error") {
    setMessage(t("common.failed"));
    toast(t("common.failed"));
    return;
  }
  await onSaved();
  onClose();
}

const field = "safe-x min-h-0 overflow-y-auto overscroll-contain pt-1 pb-4";
const footer = "safe-x flex shrink-0 flex-col gap-2 border-t border-line bg-background pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]";

export function FeedLog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useSaveLock();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("ml");
  const { when, setWhen } = useWhen();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

  async function save() {
    const entered = Number(amount);
    if (!Number.isFinite(entered) || entered <= 0) return;
    const ml = volumeToMl(entered, unit);
    setMessage(null);
    await run(async () => {
      const result = await saveLog({ kind: "feed", amountMl: Math.round(ml), occurredAt: when.toISOString() });
      await finishLog(result, t, router, setMessage, onSaved, onClose);
    });
  }

  return (
    <>
      <div className={field}>
        <WhenField when={when} onChange={setWhen} />
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-ml">
          {unit === "oz" ? t("feed.ounces") : t("feed.amount")}
          <Input
            id="feed-ml"
            type="number"
            inputMode="decimal"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <div className="mt-3">
          <PresetChips values={volumePresets(unit)} onPick={(value) => setAmount(String(value))} />
        </div>
      </div>
      <div className={footer}>
        {message ? <p role="status">{message}</p> : null}
        <Button type="button" onClick={() => void save()} disabled={pending} aria-busy={pending}>
          {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
        </Button>
      </div>
    </>
  );
}

const sides = ["left", "right"] as const;

export function DbfLog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useSaveLock();
  const [side, setSide] = useState<(typeof sides)[number] | null>(null);
  const { when, setWhen } = useWhen();
  const [minutes, setMinutes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const length = Number(minutes);
  const ready = side !== null && Number.isFinite(length) && length > 0;

  async function save() {
    if (!ready || !side) return;
    setMessage(null);
    await run(async () => {
      const result = await saveLog({
        kind: "feed",
        feedKind: "breast",
        breastSide: side,
        durationSeconds: Math.round(length * 60),
        occurredAt: when.toISOString(),
      });
      await finishLog(result, t, router, setMessage, onSaved, onClose);
    });
  }

  return (
    <>
      <div className={field}>
        <WhenField when={when} onChange={setWhen} />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{t("dbf.side")}</p>
          <div className="grid grid-cols-2 gap-2">
            {sides.map((option) => {
              const pressed = side === option;
              return (
                <Button
                  key={option}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setSide(option)}
                  variant={pressed ? "default" : "outline"}
                  className="min-h-12 rounded-2xl text-base"
                >
                  {t(`dbf.${option}`)}
                </Button>
              );
            })}
          </div>
        </div>
        <label className="mt-3 flex flex-col gap-2 text-sm font-semibold" htmlFor="dbf-minutes">
          {t("dbf.duration")}
          <Input
            id="dbf-minutes"
            type="number"
            inputMode="decimal"
            min={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <div className="mt-3">
          <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
        </div>
      </div>
      <div className={footer}>
        {message ? <p role="status">{message}</p> : null}
        <Button type="button" onClick={() => void save()} disabled={pending || !ready} aria-busy={pending}>
          {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
        </Button>
      </div>
    </>
  );
}

const diaperChoices = [
  { key: "wet", value: "wet" },
  { key: "dirty", value: "dirty" },
  { key: "both", value: "mixed" },
] as const;

const poopColors = [
  { key: "yellow", swatch: "#e6c84a" },
  { key: "green", swatch: "#7d9a62" },
  { key: "brown", swatch: "#8a5a3a" },
  { key: "black", swatch: "#2c2c2c" },
  { key: "red", swatch: "#c45c5c" },
  { key: "white", swatch: "#f7f4ee" },
] as const;

const poopAmounts = ["small", "medium", "large"] as const;

type DiaperKind = "wet" | "dirty" | "mixed";
type PoopColor = (typeof poopColors)[number]["key"];
type PoopAmount = (typeof poopAmounts)[number];

export function DiaperLog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<DiaperKind | null>(null);
  const [color, setColor] = useState<PoopColor | null>(null);
  const [amount, setAmount] = useState<PoopAmount | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { when, setWhen } = useWhen();
  const concern = color === "red" || color === "black" || color === "white";
  const detailed = kind === "dirty" || kind === "mixed";

  async function save(diaperKind: DiaperKind, poop?: { color: PoopColor | null; amount: PoopAmount | null }) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await saveLog({
        kind: "diaper",
        diaperKind,
        poopColor: poop?.color ?? undefined,
        poopAmount: poop?.amount ?? undefined,
        occurredAt: when.toISOString(),
      });
      await finishLog(result, t, router, setMessage, onSaved, onClose);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div className={field}>
        <WhenField when={when} onChange={setWhen} />
        {kind === null || kind === "wet" ? (
          <div className="grid grid-cols-1 gap-3">
            {diaperChoices.map((choice) => (
              <Button
                key={choice.key}
                type="button"
                variant="outline"
                disabled={pending}
                aria-busy={pending && choice.value === "wet"}
                onClick={() => {
                  if (choice.value === "wet") {
                    setKind("wet");
                    void save("wet");
                    return;
                  }
                  setKind(choice.value);
                  setColor(null);
                  setAmount(null);
                  setMessage(null);
                }}
                className="min-h-16 rounded-3xl text-lg text-accent"
              >
                {pending && choice.value === "wet" ? (
                  <SavingLabel label={t("common.saving")} />
                ) : (
                  <>
                    <CareIcon name="diaper" className="h-5 w-5" />
                    {t(`diaper.${choice.key}`)}
                  </>
                )}
              </Button>
            ))}
          </div>
        ) : (
          <form
            id="diaper-form"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(kind, { color, amount });
            }}
          >
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                setKind(null);
                setColor(null);
                setAmount(null);
              }}
              className="h-auto min-h-0 self-start px-0 text-sm"
            >
              {t("common.back")}
            </Button>
            <p className="text-base font-semibold">{t(kind === "dirty" ? "diaper.dirty" : "diaper.both")}</p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{t("diaper.color")}</p>
              <div className="grid grid-cols-3 gap-2">
                {poopColors.map((option) => {
                  const pressed = color === option.key;
                  return (
                    <Button
                      key={option.key}
                      type="button"
                      variant="outline"
                      aria-pressed={pressed}
                      onClick={() => setColor(pressed ? null : option.key)}
                      className={`h-auto min-h-16 flex-col gap-1 rounded-2xl px-1 text-xs ${
                        pressed ? "border-accent" : ""
                      }`}
                    >
                      <span className="h-8 w-8 rounded-full border border-line" style={{ backgroundColor: option.swatch }} />
                      {t(`diaper.${option.key}`)}
                    </Button>
                  );
                })}
              </div>
              {concern ? <p className="text-sm leading-6 text-muted">{t("diaper.poopHint")}</p> : null}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{t("diaper.amount")}</p>
              <div className="grid grid-cols-3 gap-2">
                {poopAmounts.map((option) => {
                  const pressed = amount === option;
                  return (
                    <Button
                      key={option}
                      type="button"
                      aria-pressed={pressed}
                      variant={pressed ? "default" : "outline"}
                      onClick={() => setAmount(pressed ? null : option)}
                      className="min-h-12 rounded-2xl px-2 text-sm"
                    >
                      {t(`diaper.${option}`)}
                    </Button>
                  );
                })}
              </div>
            </div>
          </form>
        )}
        {detailed ? null : message ? <p role="status" className="mt-3">{message}</p> : null}
      </div>
      {detailed ? (
        <div className={footer}>
          {message ? <p role="status">{message}</p> : null}
          <Button type="submit" form="diaper-form" disabled={pending} aria-busy={pending}>
            {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function WeightLog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useSaveLock();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(todayInput);
  const { when, setWhen } = useWhen();
  const [message, setMessage] = useState<string | null>(null);
  const parsed = Number(kg);
  const ready = Number.isFinite(parsed) && parsed > 0 && date.length > 0;

  async function save() {
    if (!ready) return;
    setMessage(null);
    await run(async () => {
      const context = await loadFamilyContext();
      if (!context?.babyId) {
        onClose();
        router.push("/onboarding");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.from("weight_logs").insert({
        baby_id: context.babyId,
        family_id: context.familyId,
        logged_by: context.userId,
        weight_grams: Math.round(parsed * 1000),
        weighed_on: toWhenInput(when).slice(0, 10),
      });
      if (error) {
        setMessage(t("common.failed"));
        return;
      }
      await onSaved();
      onClose();
    });
  }

  return (
    <>
      <div className={field}>
        <WhenField when={when} onChange={setWhen} />
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="weight-kg">
          {t("weight.kg")}
          <Input
            id="weight-kg"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            value={kg}
            onChange={(event) => setKg(event.target.value)}
          />
        </label>
        <label className="mt-3 flex flex-col gap-2 text-sm font-semibold" htmlFor="weight-date">
          {t("weight.date")}
          <Input
            id="weight-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>
      <div className={footer}>
        {message ? <p role="status">{message}</p> : null}
        <Button type="button" onClick={() => void save()} disabled={pending || !ready} aria-busy={pending}>
          {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
        </Button>
      </div>
    </>
  );
}

function formatWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PumpLog({
  onClose,
  onSaved,
  activePartPumpIds = [],
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  activePartPumpIds?: string[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const care = useCareStore();
  const [status, setStatus] = useState<string | null>(null);
  const [pumpedMl, setPumpedMl] = useState("");
  const [minutes, setMinutes] = useState("");
  const [logged, setLogged] = useState(false);
  const [storeParts, setStoreParts] = useState(false);
  const [saveMilk, setSaveMilk] = useState(false);
  const [pumpId, setPumpId] = useState<string | null>(null);
  const [volume, setVolume] = useState("");
  const [milkLocation, setMilkLocation] = useState<ChillerLocation>("fridge");
  const [pending, setPending] = useState<"log" | "chiller" | null>(null);
  const [unit, setUnit] = useState("ml");
  const lock = useRef(false);
  const { when, setWhen } = useWhen();

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

  const onlyPumpId = care.pumps.length === 1 ? care.pumps[0].id : null;
  const activePumpId = pumpId && care.pumps.some((pump) => pump.id === pumpId) ? pumpId : onlyPumpId;
  const selectedPump = care.pumps.find((pump) => pump.id === activePumpId) ?? null;
  const partsTime = formatWhen(partsExpiresAt(new Date(), care.washByHours).toISOString(), locale);
  const pumpedAmount = Number(pumpedMl);
  const minutesBlank = minutes.trim() === "";
  const sessionMinutes = Number(minutes);
  const minutesOk = minutesBlank || (Number.isFinite(sessionMinutes) && sessionMinutes > 0);
  const canLog = Number.isFinite(pumpedAmount) && pumpedAmount > 0 && minutesOk && Boolean(selectedPump);
  const canConfirm = (storeParts && Boolean(selectedPump)) || saveMilk;

  async function confirm() {
    if (lock.current || !canConfirm) return;
    lock.current = true;
    setPending("chiller");
    setStatus(null);
    try {
      const parsed = volume.trim() === "" ? null : Number(volume);
      const volumeMl = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? volumeToMl(parsed, unit) : null;
      const context = await loadFamilyContext();
      const washByHours = context?.washByHours ?? care.washByHours;
      if (storeParts && selectedPump) {
        const saved = await saveChillerItem({
          type: "pump_parts",
          location: "fridge",
          volumeMl: null,
          pumpId: selectedPump.id,
          washByHours,
          storedAt: when.toISOString(),
        });
        if (saved.status === "error") {
          setStatus(t("common.failed"));
          return;
        }
        if (activePartPumpIds.includes(selectedPump.id)) toast(t("chiller.partsUpdated"));
      }
      if (saveMilk) {
        const saved = await saveChillerItem({
          type: "milk",
          location: milkLocation,
          volumeMl: volumeMl ?? volumeToMl(pumpedAmount, unit),
          pumpId: null,
          washByHours,
          babyId: null,
          storedAt: when.toISOString(),
        });
        if (saved.status === "error") {
          setStatus(t("common.failed"));
          return;
        }
      }
      await onSaved();
      onClose();
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function logPump() {
    if (lock.current || !selectedPump || !canLog) return;
    lock.current = true;
    setPending("log");
    setStatus(null);
    try {
      const minutesValue = minutes.trim() === "" ? null : Math.round(Number(minutes) * 60);
      const result = await saveLog({
        kind: "pump",
        amountMl: volumeToMl(pumpedAmount, unit),
        durationSeconds: minutesValue && minutesValue > 0 ? minutesValue : null,
        pumpId: selectedPump.id,
        occurredAt: when.toISOString(),
      });
      if (result === "needs-family") {
        onClose();
        router.push("/onboarding");
        return;
      }
      if (result === "error") {
        setStatus(t("common.failed"));
        return;
      }
      markPumpUsed(selectedPump.id);
      await onSaved();
      setLogged(true);
      setStatus(null);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <>
      <div className={field}>
        <WhenField when={when} onChange={setWhen} />
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pumped-ml">
          {t("pump.amount")}
          <Input
            id="pumped-ml"
            type="number"
            inputMode="decimal"
            min={1}
            value={pumpedMl}
            onChange={(event) => setPumpedMl(event.target.value)}
          />
        </label>
        <div className="mt-3">
          <PresetChips values={volumePresets(unit)} onPick={(value) => setPumpedMl(String(value))} />
        </div>
        <label className="mt-3 flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-minutes">
          {t("pump.duration")}
          <Input
            id="pump-minutes"
            type="number"
            inputMode="numeric"
            min={0}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <div className="mt-3">
          <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
        </div>
        {care.pumps.length === 0 ? (
          <p className="mt-3 text-sm leading-6">
            {t("pump.noPumps")}{" "}
            <Link href="/settings" className="font-semibold text-accent" onClick={onClose}>
              {t("pump.addPumps")}
            </Link>
          </p>
        ) : (
          <label className="mt-3 flex flex-col gap-2 text-sm font-semibold" htmlFor="session-pump">
            {t("pump.pickPump")}
            <Select value={selectedPump?.id} onValueChange={setPumpId}>
              <SelectTrigger id="session-pump">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {care.pumps.map((pump) => (
                  <SelectItem key={pump.id} value={pump.id}>
                    {pumpLabel(pump)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {logged ? (
          <Card className="mt-4 gap-4 p-4">
            <p className="text-sm leading-6">{t("pump.logged")}</p>
            <label className="flex min-h-12 items-center justify-between gap-3 text-base font-semibold">
              <span>{t("pump.storeParts")}</span>
              <Switch checked={storeParts} onCheckedChange={setStoreParts} className="h-6 w-11" />
            </label>
            {storeParts && selectedPump && activePartPumpIds.includes(selectedPump.id) ? (
              <p className="text-sm text-muted">{t("chiller.replacesExisting")}</p>
            ) : null}
            {storeParts ? <PartsDisclaimer time={partsTime} seen={care.partsDisclaimerSeen} /> : null}
            <label className="flex min-h-12 items-center justify-between gap-3 text-base font-semibold">
              <span>{t("pump.saveMilk")}</span>
              <Switch checked={saveMilk} onCheckedChange={setSaveMilk} className="h-6 w-11" />
            </label>
            {saveMilk ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="milk-ml">
                  {t("pump.milkAmount")}
                  <Input
                    id="milk-ml"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={volume}
                    onChange={(event) => setVolume(event.target.value)}
                  />
                </label>
                <PresetChips values={volumePresets(unit)} onPick={(value) => setVolume(String(value))} />
                <p className="text-sm text-muted">{t("pump.milkOptional")}</p>
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="milk-location">
                  {t("pump.location")}
                  <Select
                    value={milkLocation}
                    onValueChange={(value) => {
                      if (
                        value === "room" ||
                        value === "fridge" ||
                        value === "freezer" ||
                        value === "cooler" ||
                        value === "thawed" ||
                        value === "leftover"
                      ) {
                        setMilkLocation(value);
                      }
                    }}
                  >
                    <SelectTrigger id="milk-location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHILLER_LOCATIONS.map((location) => (
                        <SelectItem key={location} value={location}>
                          {t(`chiller.${location}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
      <div className={footer}>
        {status ? <p role="status">{status}</p> : null}
        {logged ? (
          <Button type="button" onClick={() => void confirm()} disabled={!canConfirm || pending !== null} aria-busy={pending === "chiller"}>
            {pending === "chiller" ? <SavingLabel label={t("common.saving")} /> : t("pump.confirm")}
          </Button>
        ) : (
          <Button type="button" onClick={() => void logPump()} disabled={!canLog || pending !== null} aria-busy={pending === "log"}>
            {pending === "log" ? <SavingLabel label={t("common.saving")} /> : t("pump.log")}
          </Button>
        )}
      </div>
    </>
  );
}
