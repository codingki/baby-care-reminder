"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { MINUTE_PRESETS, PresetChips } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useSaveLock } from "@/components/use-save-lock";
import { useI18n } from "@/i18n/provider";
import { saveLog } from "@/lib/save-log";

const sides = ["left", "right"] as const;

export default function DbfPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useSaveLock();
  const [side, setSide] = useState<(typeof sides)[number] | null>(null);
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
      });
      if (result === "needs-family") {
        router.push("/onboarding");
        return;
      }
      if (result === "error") {
        setMessage(t("common.failed"));
        return;
      }
      setMessage(result === "queued" ? t("common.queued") : t("common.saved"));
      if (result === "synced") router.push("/");
    });
  }

  return (
    <Screen
      titleKey="dbf.title"
      ledeKey="dbf.lede"
      backHref="/"
      showLater={false}
      icon={<CareIcon name="dbf" className="h-8 w-8" />}
      footer={
        <>
          {message ? <p role="status">{message}</p> : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending || !ready}
            aria-busy={pending}
            className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("dbf.side")}</p>
        <div className="grid grid-cols-2 gap-2">
          {sides.map((option) => {
            const pressed = side === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={pressed}
                onClick={() => setSide(option)}
                className={`min-h-12 rounded-2xl text-base font-semibold ${
                  pressed ? "bg-accent text-accent-foreground" : "border border-line bg-card text-foreground"
                }`}
              >
                {t(`dbf.${option}`)}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="dbf-minutes">
        {t("dbf.duration")}
        <input
          id="dbf-minutes"
          type="number"
          inputMode="decimal"
          min={1}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
      <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
    </Screen>
  );
}
