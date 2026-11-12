"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { DecimalInput } from "@/components/decimal-input";
import { MINUTE_PRESETS, PresetChips, volumePresets, volumeToMl } from "@/components/preset-chips";
import { PartsDisclaimer } from "@/components/parts-disclaimer";
import { Button } from "@/components/ui/button";
import { toWhenInput, WhenField, useWhen } from "@/components/when-field";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChoiceButtons, OptionSheet } from "@/components/option-sheet";
import { Switch } from "@/components/ui/switch";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { parseDecimal } from "@/lib/decimal";
import type { Locale } from "@/i18n/locales";
import { loadFamilyContext } from "@/lib/family-context";
import { launchChiller, launchLog, launchWeight, type FailedSave, type SaveSeed } from "@/lib/optimistic-care";
import { milkExpiresAt } from "@/lib/storage-rules";
import {
  CHILLER_LOCATIONS,
  markPumpUsed,
  partsExpiresAt,
  pumpLabel,
  type ChillerLocation,
} from "@/lib/device-care";
function todayInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type LogExtras = {
  seed?: SaveSeed | null;
  notice?: string | null;
  onEdit?: (failed: FailedSave) => void;
};

const field = "safe-x min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain pt-1 pb-4";
const footer = "safe-x flex shrink-0 flex-col gap-2 border-t border-line bg-background pt-3";

export function FeedLog({ onClose, onSaved, seed, notice, onEdit }: { onClose: () => void; onSaved: () => Promise<void> } & LogExtras) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [amount, setAmount] = useState(seed?.amount ?? "");
  const [unit, setUnit] = useState(seed?.unit ?? "ml");
  const { when, setWhen } = useWhen(seed?.when);
  const [message, setMessage] = useState<string | null>(notice ?? null);
  void onSaved;

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

  async function save() {
    const entered = parseDecimal(amount);
    if (entered === null || entered <= 0) return;
    if (lock.current) return;
    lock.current = true;
    const ml = volumeToMl(entered, unit);
    const id = seed?.id || crypto.randomUUID();
    launchLog({
      input: { id, kind: "feed", amountMl: Math.round(ml), occurredAt: when.toISOString() },
      seed: { id, amount, unit, when: when.toISOString() },
      sheet: "feed",
      title: t("home.feed"),
      failText: t("common.failed"),
      retryText: t("common.retry"),
      onClose,
      onEdit: onEdit ?? (() => undefined),
      onNeedsFamily: () => {
        onClose();
        router.push("/onboarding");
      },
    });
  }

  return (
    <>
      <div data-slot="dialog-scroll" data-vaul-no-drag className={field}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-ml">
            {unit === "oz" ? t("feed.ounces") : t("feed.amount")}
          <DecimalInput locale={locale} id="feed-ml" value={amount} onValueChange={setAmount} />
          </label>
          <PresetChips values={volumePresets(unit)} onPick={(value) => setAmount(String(value))} />
        </div>
        <WhenField when={when} onChange={setWhen} />
      </div>
      <div data-slot="dialog-footer" className={footer}>
        {message ? <p role="status">{message}</p> : null}
        <Button type="button" onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </div>
    </>
  );
}

const sides = ["left", "right"] as const;

export function DbfLog({ onClose, onSaved, seed, notice, onEdit }: { onClose: () => void; onSaved: () => Promise<void> } & LogExtras) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [side, setSide] = useState<(typeof sides)[number] | null>(
    seed?.side === "left" || seed?.side === "right" ? seed.side : null,
  );
  const { when, setWhen } = useWhen(seed?.when);
  const [minutes, setMinutes] = useState(seed?.minutes ?? "");
  const [message, setMessage] = useState<string | null>(notice ?? null);
  void onSaved;
  const length = parseDecimal(minutes);
  const ready = side !== null && length !== null && length > 0;

  function save() {
    if (!ready || !side || length === null || lock.current) return;
    lock.current = true;
    const id = seed?.id || crypto.randomUUID();
    launchLog({
      input: {
        id,
        kind: "feed",
        feedKind: "breast",
        breastSide: side,
        durationSeconds: Math.round(length * 60),
        occurredAt: when.toISOString(),
      },
      seed: { id, side, minutes, when: when.toISOString() },
      sheet: "dbf",
      title: t("home.dbf"),
      failText: t("common.failed"),
      retryText: t("common.retry"),
      onClose,
      onEdit: onEdit ?? (() => undefined),
      onNeedsFamily: () => {
        onClose();
        router.push("/onboarding");
      },
    });
  }

  return (
    <>
      <div data-slot="dialog-scroll" data-vaul-no-drag className={field}>
        <div className="flex flex-col gap-4">
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
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="dbf-minutes">
          {t("dbf.duration")}
          <DecimalInput locale={locale} id="dbf-minutes" value={minutes} onValueChange={setMinutes} />
        </label>
        <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
        </div>
        <WhenField when={when} onChange={setWhen} />
      </div>
      <div data-slot="dialog-footer" className={footer}>
        {message ? <p role="status">{message}</p> : null}
        <Button type="button" onClick={() => save()} disabled={!ready}>
          {t("common.save")}
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

export function DiaperLog({ onClose, onSaved, seed, notice, onEdit }: { onClose: () => void; onSaved: () => Promise<void> } & LogExtras) {
  const { t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [kind, setKind] = useState<DiaperKind | null>(
    seed?.diaperKind === "wet" || seed?.diaperKind === "dirty" || seed?.diaperKind === "mixed" ? seed.diaperKind : null,
  );
  const [color, setColor] = useState<PoopColor | null>((seed?.color as PoopColor | undefined) ?? null);
  const [amount, setAmount] = useState<PoopAmount | null>((seed?.poopAmount as PoopAmount | undefined) ?? null);
  const [message, setMessage] = useState<string | null>(notice ?? null);
  const { when, setWhen } = useWhen(seed?.when);
  void onSaved;
  const concern = color === "red" || color === "black" || color === "white";
  const detailed = kind === "dirty" || kind === "mixed";

  function save(diaperKind: DiaperKind, poop?: { color: PoopColor | null; amount: PoopAmount | null }) {
    if (lock.current) return;
    lock.current = true;
    const id = seed?.id || crypto.randomUUID();
    launchLog({
      input: {
        id,
        kind: "diaper",
        diaperKind,
        poopColor: poop?.color ?? undefined,
        poopAmount: poop?.amount ?? undefined,
        occurredAt: when.toISOString(),
      },
      seed: {
        id,
        diaperKind,
        color: poop?.color ?? "",
        poopAmount: poop?.amount ?? "",
        when: when.toISOString(),
      },
      sheet: "diaper",
      title: t("home.diaper"),
      failText: t("common.failed"),
      retryText: t("common.retry"),
      onClose,
      onEdit: onEdit ?? (() => undefined),
      onNeedsFamily: () => {
        onClose();
        router.push("/onboarding");
      },
    });
  }

  return (
    <>
      <div data-slot="dialog-scroll" data-vaul-no-drag className={field}>
        {kind === null || kind === "wet" ? (
          <div className="grid grid-cols-1 gap-3">
            {diaperChoices.map((choice) => (
              <Button
                key={choice.key}
                type="button"
                variant="outline"
                disabled={false}
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
                <>
                  <CareIcon name="diaper" className="h-5 w-5" />
                  {t(`diaper.${choice.key}`)}
                </>
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
        <WhenField when={when} onChange={setWhen} />
      </div>
      {detailed ? (
        <div data-slot="dialog-footer" className={footer}>
          {message ? <p role="status">{message}</p> : null}
          <Button type="submit" form="diaper-form">
            {t("common.save")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function WeightLog({ onClose, onSaved, seed, notice, onEdit }: { onClose: () => void; onSaved: () => Promise<void> } & LogExtras) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [kg, setKg] = useState(seed?.kg ?? "");
  const [date, setDate] = useState(seed?.date ?? todayInput);
  const { when, setWhen } = useWhen(seed?.when);
  const [message, setMessage] = useState<string | null>(notice ?? null);
  void onSaved;
  const parsed = parseDecimal(kg);
  const ready = parsed !== null && parsed > 0 && date.length > 0;

  function save() {
    if (!ready || parsed === null || lock.current) return;
    lock.current = true;
    const id = seed?.id || crypto.randomUUID();
    const weighedOn = toWhenInput(when).slice(0, 10);
    launchWeight({
      id,
      grams: Math.round(parsed * 1000),
      weighedOn,
      seed: { id, kg, date, when: when.toISOString() },
      title: t("home.weight"),
      failText: t("common.failed"),
      retryText: t("common.retry"),
      onClose,
      onEdit: onEdit ?? (() => undefined),
      onNeedsFamily: () => {
        onClose();
        router.push("/onboarding");
      },
    });
  }

  return (
    <>
      <div data-slot="dialog-scroll" data-vaul-no-drag className={field}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="weight-kg">
            {t("weight.kg")}
          <DecimalInput locale={locale} id="weight-kg" value={kg} onValueChange={setKg} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="weight-date">
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
        <WhenField when={when} onChange={setWhen} />
      </div>
      <div data-slot="dialog-footer" className={footer}>
        {message ? <p role="status">{message}</p> : null}
        <Button type="button" onClick={() => save()} disabled={!ready}>
          {t("common.save")}
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
  seed,
  notice,
  onEdit,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  activePartPumpIds?: string[];
} & LogExtras) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const care = useCareStore();
  const [status, setStatus] = useState<string | null>(notice ?? null);
  const [pumpedMl, setPumpedMl] = useState(seed?.amount ?? "");
  const [minutes, setMinutes] = useState(seed?.minutes ?? "");
  const [logged, setLogged] = useState(false);
  const [storeParts, setStoreParts] = useState(false);
  const [saveMilk, setSaveMilk] = useState(false);
  const [pumpId, setPumpId] = useState<string | null>(seed?.pumpId ?? null);
  const [volume, setVolume] = useState(seed?.volume ?? "");
  const [milkLocation, setMilkLocation] = useState<ChillerLocation>(
    seed?.location === "fridge" || seed?.location === "freezer" || seed?.location === "cooler" ? seed.location : "fridge",
  );
  const [unit, setUnit] = useState(seed?.unit ?? "ml");
  const lock = useRef(false);
  const { when, setWhen } = useWhen(seed?.when);
  void onSaved;

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

  const onlyPumpId = care.pumps.length === 1 ? care.pumps[0].id : null;
  const activePumpId = pumpId && care.pumps.some((pump) => pump.id === pumpId) ? pumpId : onlyPumpId;
  const selectedPump = care.pumps.find((pump) => pump.id === activePumpId) ?? null;
  const partsTime = formatWhen(partsExpiresAt(new Date(), care.washByHours).toISOString(), locale);
  const pumpedAmount = parseDecimal(pumpedMl);
  const minutesBlank = minutes.trim() === "";
  const sessionMinutes = parseDecimal(minutes);
  const minutesOk = minutesBlank || (sessionMinutes !== null && sessionMinutes > 0);
  const canLog = pumpedAmount !== null && pumpedAmount > 0 && minutesOk && Boolean(selectedPump);
  const canConfirm = (storeParts && Boolean(selectedPump)) || saveMilk;

  function confirm() {
    if (lock.current || !canConfirm) return;
    lock.current = true;
    const parsed = volume.trim() === "" ? null : parseDecimal(volume);
    const volumeMl = parsed !== null && parsed > 0 ? volumeToMl(parsed, unit) : null;
    const washByHours = care.washByHours;
    const storedAt = when.toISOString();
    const edit = onEdit ?? (() => undefined);
    if (storeParts && selectedPump) {
      const id = crypto.randomUUID();
      const expiresAt = partsExpiresAt(when, washByHours).toISOString();
      launchChiller({
        item: {
          id,
          type: "pump_parts",
          location: "fridge",
          storedAt,
          expiresAt,
          pumpId: selectedPump.id,
          volumeMl: null,
          note: null,
          pumpName: pumpLabel(selectedPump),
          babyId: null,
          babyName: null,
          clearedAt: null,
          clearedReason: null,
          pending: true,
        },
        seed: { id, pumpId: selectedPump.id, when: storedAt },
        title: t("chiller.parts"),
        failText: t("common.failed"),
        retryText: t("common.retry"),
        washByHours,
        onClose,
        onEdit: edit,
      });
      if (activePartPumpIds.includes(selectedPump.id)) toast(t("chiller.partsUpdated"));
    }
    if (saveMilk) {
      const id = crypto.randomUUID();
      const ml = volumeMl ?? (pumpedAmount !== null ? volumeToMl(pumpedAmount, unit) : null);
      launchChiller({
        item: {
          id,
          type: "milk",
          location: milkLocation,
          storedAt,
          expiresAt: milkExpiresAt(when, milkLocation).toISOString(),
          pumpId: null,
          volumeMl: ml,
          note: null,
          pumpName: null,
          babyId: null,
          babyName: null,
          clearedAt: null,
          clearedReason: null,
          pending: true,
        },
        seed: { id, location: milkLocation, volume: volume, when: storedAt },
        title: t("chiller.milk"),
        failText: t("common.failed"),
        retryText: t("common.retry"),
        washByHours,
        onClose,
        onEdit: edit,
      });
    }
  }

  function logPump() {
    if (lock.current || !selectedPump || !canLog || pumpedAmount === null) return;
    lock.current = true;
    const id = seed?.id || crypto.randomUUID();
    const minutesValue = minutes.trim() === "" || sessionMinutes === null ? null : Math.round(sessionMinutes * 60);
    markPumpUsed(selectedPump.id);
    launchLog({
      input: {
        id,
        kind: "pump",
        amountMl: volumeToMl(pumpedAmount, unit),
        durationSeconds: minutesValue && minutesValue > 0 ? minutesValue : null,
        pumpId: selectedPump.id,
        occurredAt: when.toISOString(),
      },
      seed: { id, amount: pumpedMl, minutes, unit, pumpId: selectedPump.id, when: when.toISOString() },
      sheet: "pump",
      title: t("home.pump"),
      failText: t("common.failed"),
      retryText: t("common.retry"),
      onClose: () => setLogged(true),
      onEdit: onEdit ?? (() => undefined),
      onNeedsFamily: () => {
        onClose();
        router.push("/onboarding");
      },
    });
    lock.current = false;
  }

  return (
    <>
      <div data-slot="dialog-scroll" data-vaul-no-drag className={field}>
        <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pumped-ml">
          {t("pump.amount")}
          <DecimalInput locale={locale} id="pumped-ml" value={pumpedMl} onValueChange={setPumpedMl} />
        </label>
        <PresetChips values={volumePresets(unit)} onPick={(value) => setPumpedMl(String(value))} />
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-minutes">
          {t("pump.duration")}
          <DecimalInput locale={locale} id="pump-minutes" value={minutes} onValueChange={setMinutes} />
        </label>
        <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
        {care.pumps.length === 0 ? (
          <p className="text-sm leading-6">
            {t("pump.noPumps")}{" "}
            <Link href="/settings" className="font-semibold text-accent" onClick={onClose}>
              {t("pump.addPumps")}
            </Link>
          </p>
        ) : (
          <OptionSheet
            id="session-pump"
            label={t("pump.pickPump")}
            value={selectedPump?.id ?? ""}
            searchable={care.pumps.length > 8}
            options={care.pumps.map((pump) => ({ value: pump.id, label: pumpLabel(pump) }))}
            onChange={setPumpId}
          />
        )}
        {logged ? (
          <Card className="gap-4 p-4">
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
                  <DecimalInput locale={locale} id="milk-ml" value={volume} onValueChange={setVolume} />
                </label>
                <PresetChips values={volumePresets(unit)} onPick={(value) => setVolume(String(value))} />
                <p className="text-sm text-muted">{t("pump.milkOptional")}</p>
                <ChoiceButtons
                  label={t("pump.location")}
                  value={milkLocation}
                  options={CHILLER_LOCATIONS.map((location) => ({ value: location, label: t(`chiller.${location}`) }))}
                  onChange={(value) => {
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
                />
              </div>
            ) : null}
          </Card>
        ) : null}
        </div>
        <WhenField when={when} onChange={setWhen} />
      </div>
      <div data-slot="dialog-footer" className={footer}>
        {status ? <p role="status">{status}</p> : null}
        {logged ? (
          <Button type="button" onClick={() => confirm()} disabled={!canConfirm}>
            {t("pump.confirm")}
          </Button>
        ) : (
          <Button type="button" onClick={() => logPump()} disabled={!canLog}>
            {t("pump.log")}
          </Button>
        )}
      </div>
    </>
  );
}
