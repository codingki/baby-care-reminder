"use client";

import { useState } from "react";
import { MINUTE_PRESETS, PresetChips } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { rememberBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

const sexes = ["female", "male", "unspecified"] as const;

export function AddBabyForm({
  familyId,
  idPrefix,
  onCreated,
}: {
  familyId: string;
  idPrefix: string;
  onCreated: (baby: { id: string; name: string }) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<(typeof sexes)[number]>("unspecified");
  const [weightKg, setWeightKg] = useState("");
  const [feedMinutes, setFeedMinutes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (pending) return;
    const kg = Number(weightKg);
    const minutes = feedMinutes.trim() === "" ? null : Math.round(Number(feedMinutes));
    if (!name.trim() || !birthDate || !Number.isFinite(kg) || kg <= 0 || (minutes !== null && minutes <= 0)) {
      setError(t("onboarding.error"));
      return;
    }
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("babies")
      .insert({
        family_id: familyId,
        name: name.trim(),
        birth_date: birthDate,
        sex,
        weight_grams: Math.round(kg * 1000),
        feeding_type: "bottle",
        suggested_interval_minutes: minutes,
      })
      .select("id")
      .single();
    setPending(false);
    if (insertError || !data?.id) {
      setError(t("onboarding.error"));
      return;
    }
    rememberBaby(familyId, data.id);
    onCreated({ id: data.id, name: name.trim() });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-name`}>
        {t("onboarding.name")}
        <input
          id={`${idPrefix}-name`}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-birth`}>
        {t("onboarding.birthDate")}
        <input
          id={`${idPrefix}-birth`}
          type="date"
          required
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-sex`}>
        {t("onboarding.sex")}
        <select
          id={`${idPrefix}-sex`}
          value={sex}
          onChange={(event) => setSex(event.target.value as (typeof sexes)[number])}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        >
          {sexes.map((option) => (
            <option key={option} value={option}>
              {t(`onboarding.${option}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-weight`}>
        {t("onboarding.weightKg")}
        <input
          id={`${idPrefix}-weight`}
          type="number"
          inputMode="decimal"
          min={0.1}
          step={0.01}
          required
          value={weightKg}
          onChange={(event) => setWeightKg(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-feed`}>
        {t("settings.feedInterval")}
        <input
          id={`${idPrefix}-feed`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={feedMinutes}
          onChange={(event) => setFeedMinutes(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
        <PresetChips values={MINUTE_PRESETS} onPick={(value) => setFeedMinutes(String(value))} />
      </label>
      <p className="text-sm text-muted">{t("settings.feedIntervalHint")}</p>
      <p className="text-sm text-muted">
        {t("onboarding.feeding")} · {t("onboarding.bottleOnly")}
      </p>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? <SavingLabel label={t("common.saving")} /> : t("onboarding.saveBaby")}
      </Button>
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
