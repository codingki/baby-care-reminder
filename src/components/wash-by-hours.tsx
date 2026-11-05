"use client";

import { clampWashByHours, setWashByHours } from "@/lib/device-care";
import { useI18n } from "@/i18n/provider";
import { useCareStore } from "@/components/use-care-store";

export function WashByHours() {
  const { t } = useI18n();
  const { washByHours } = useCareStore();

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold">{t("settings.washBy")}</h2>
      <p className="text-base font-semibold">{t("settings.washByHours", { hours: String(washByHours) })}</p>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="wash-by-hours">
        {t("settings.washByHint")}
        <input
          id="wash-by-hours"
          type="number"
          inputMode="numeric"
          min={1}
          max={24}
          step={1}
          value={washByHours}
          onChange={(event) => setWashByHours(clampWashByHours(Number(event.target.value)))}
          className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
        />
      </label>
    </section>
  );
}
