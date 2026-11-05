"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PartsDisclaimer } from "@/components/parts-disclaimer";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { saveChillerItem, saveLog } from "@/lib/save-log";
import type { Locale } from "@/i18n/locales";
import {
  CHILLER_LOCATIONS,
  defaultPumpId,
  markPumpUsed,
  partsExpiresAt,
  pumpLabel,
  type ChillerLocation,
} from "@/lib/device-care";

function formatWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PumpPage() {
  return (
    <Screen titleKey="pump.title" ledeKey="pump.lede" backHref="/" showLater={false}>
      <PumpLog />
    </Screen>
  );
}

function PumpLog() {
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
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const fallbackPumpId = defaultPumpId(care.pumps);
  const activePumpId =
    pumpId && care.pumps.some((pump) => pump.id === pumpId) ? pumpId : fallbackPumpId;
  const selectedPump = care.pumps.find((pump) => pump.id === activePumpId) ?? null;
  const partsTime = formatWhen(partsExpiresAt(new Date(), care.washByHours).toISOString(), locale);
  const pumpedAmount = Number(pumpedMl);
  const minutesBlank = minutes.trim() === "";
  const sessionMinutes = Number(minutes);
  const minutesOk =
    minutesBlank || (Number.isFinite(sessionMinutes) && sessionMinutes > 0);
  const canLog =
    Number.isFinite(pumpedAmount) && pumpedAmount > 0 && minutesOk && Boolean(selectedPump);
  const canStoreParts = storeParts && Boolean(selectedPump);
  const canConfirm = canStoreParts || saveMilk;

  async function confirm() {
    const parsed = volume.trim() === "" ? null : Number(volume);
    const volumeMl =
      parsed !== null && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    const context = await loadFamilyContext();
    const washByHours = context?.washByHours ?? care.washByHours;
    const ids: string[] = [];
    if (storeParts && selectedPump) {
      const saved = await saveChillerItem({
        type: "pump_parts",
        location: "fridge",
        volumeMl: null,
        pumpId: selectedPump.id,
        washByHours,
      });
      ids.push(saved.id);
    }
    if (saveMilk) {
      const saved = await saveChillerItem({
        type: "milk",
        location: milkLocation,
        volumeMl: volumeMl ?? Math.round(pumpedAmount),
        pumpId: null,
        washByHours,
      });
      ids.push(saved.id);
    }
    setAddedIds(ids);
    setStatus(t("common.saved"));
  }

  async function logPump() {
    if (!selectedPump || !canLog) return;
    const minutesValue = minutes.trim() === "" ? null : Math.round(Number(minutes) * 60);
    const result = await saveLog({
      kind: "pump",
      amountMl: Math.round(pumpedAmount),
      durationSeconds: minutesValue && minutesValue > 0 ? minutesValue : null,
      pumpId: selectedPump.id,
    });
    if (result === "needs-family") {
      router.push("/onboarding");
      return;
    }
    if (result === "error") {
      setStatus(t("common.failed"));
      return;
    }
    markPumpUsed(selectedPump.id);
    setStatus(result === "queued" ? t("common.queued") : t("common.saved"));
    setLogged(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pumped-ml">
        {t("pump.amount")}
        <input
          id="pumped-ml"
          type="number"
          inputMode="decimal"
          min={1}
          value={pumpedMl}
          onChange={(event) => setPumpedMl(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-minutes">
        {t("pump.duration")}
        <input
          id="pump-minutes"
          type="number"
          inputMode="numeric"
          min={0}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
        />
      </label>
      {care.pumps.length === 0 ? (
        <p className="text-sm leading-6">
          {t("pump.noPumps")}{" "}
          <Link href="/settings" className="font-semibold text-accent">
            {t("pump.addPumps")}
          </Link>
        </p>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="session-pump">
          {t("pump.pickPump")}
          <select
            id="session-pump"
            value={selectedPump?.id ?? ""}
            onChange={(event) => setPumpId(event.target.value)}
            className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
          >
            {care.pumps.map((pump) => (
              <option key={pump.id} value={pump.id}>
                {pumpLabel(pump)}
              </option>
            ))}
          </select>
        </label>
      )}
      {logged ? (
        <div className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4">
          <p className="text-sm leading-6">{t("pump.logged")}</p>
          <Toggle
            label={t("pump.storeParts")}
            checked={storeParts}
            onChange={setStoreParts}
          />
          {storeParts ? (
            <PartsDisclaimer time={partsTime} seen={care.partsDisclaimerSeen} />
          ) : null}
          <Toggle label={t("pump.saveMilk")} checked={saveMilk} onChange={setSaveMilk} />
          {saveMilk ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="milk-ml">
                {t("pump.milkAmount")}
                <input
                  id="milk-ml"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={volume}
                  onChange={(event) => setVolume(event.target.value)}
                  className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
                />
              </label>
              <p className="text-sm text-muted">{t("pump.milkOptional")}</p>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="milk-location">
                {t("pump.location")}
                <select
                  id="milk-location"
                  value={milkLocation}
                  onChange={(event) => setMilkLocation(event.target.value as ChillerLocation)}
                  className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
                >
                  {CHILLER_LOCATIONS.map((location) => (
                    <option key={location} value={location}>
                      {t(`chiller.${location}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!canConfirm}
            onClick={confirm}
            className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t("pump.confirm")}
          </button>
          {addedIds.length > 0 ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>{t("pump.added")}</p>
              {addedIds.map((id) => (
                <Link key={id} href={`/chiller/${id}`} className="font-semibold text-accent">
                  {t("chiller.detailTitle")}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={logPump}
          disabled={!canLog}
          className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
        >
          {t("pump.log")}
        </button>
      )}
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 text-base font-semibold">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-6 w-11 accent-[#5f7f6c]"
      />
    </label>
  );
}
