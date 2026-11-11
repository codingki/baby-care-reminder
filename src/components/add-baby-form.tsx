"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MINUTE_PRESETS, PresetChips } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/decimal-input";
import { Input } from "@/components/ui/input";
import { ChoiceButtons } from "@/components/option-sheet";
import { useI18n } from "@/i18n/provider";
import { parseDecimal } from "@/lib/decimal";
import { useQueryClient } from "@tanstack/react-query";
import { CARE_SCOPE_KEY, type CareScope } from "@/lib/care-queries";
import { rememberBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

function normalizeBirthDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (!parts) return null;
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const year = parts[3];
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<(typeof sexes)[number]>("unspecified");
  const [weightKg, setWeightKg] = useState("");
  const [feedMinutes, setFeedMinutes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(form: HTMLFormElement) {
    if (pending) return;
    const birthInput = form.querySelector<HTMLInputElement>("input[type='date']");
    const birth = normalizeBirthDate(birthInput?.value || birthDate);
    const kgText = weightKg.trim();
    const kg = kgText === "" ? null : parseDecimal(kgText);
    const minutesParsed = feedMinutes.trim() === "" ? null : parseDecimal(feedMinutes);
    const minutes = minutesParsed === null ? null : Math.round(minutesParsed);
    if (
      !familyId ||
      !name.trim() ||
      !birth ||
      (kgText !== "" && (kg === null || kg <= 0)) ||
      (feedMinutes.trim() !== "" && (minutes === null || minutes <= 0))
    ) {
      setError(t("onboarding.error"));
      toast(t("onboarding.error"));
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
        birth_date: birth,
        sex,
        weight_grams: kg === null ? null : Math.round(kg * 1000),
        suggested_interval_minutes: minutes,
      })
      .select("id")
      .single();
    setPending(false);
    if (insertError || !data?.id) {
      const message = insertError?.message || t("onboarding.error");
      setError(message);
      toast(message);
      return;
    }
    rememberBaby(familyId, data.id);
    queryClient.setQueryData<CareScope | null>(CARE_SCOPE_KEY, (current) =>
      current && current.familyId === familyId ? { ...current, babyId: data.id } : current,
    );
    onCreated({ id: data.id, name: name.trim() });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-name`}>
        {t("onboarding.name")}
        <Input id={`${idPrefix}-name`} required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-birth`}>
        {t("onboarding.birthDate")}
        <Input
          id={`${idPrefix}-birth`}
          type="date"
          required
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
        />
      </label>
      <ChoiceButtons
        label={t("onboarding.sex")}
        value={sex}
        options={sexes.map((option) => ({ value: option, label: t(`onboarding.${option}`) }))}
        onChange={(value) => {
          if (value === "female" || value === "male" || value === "unspecified") setSex(value);
        }}
      />
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-weight`}>
        {t("onboarding.weightKg")}
        <DecimalInput
          locale={locale}
          id={`${idPrefix}-weight`}
          value={weightKg}
          onValueChange={setWeightKg}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor={`${idPrefix}-feed`}>
        {t("settings.feedInterval")}
        <DecimalInput
          locale={locale}
          id={`${idPrefix}-feed`}
          value={feedMinutes}
          onValueChange={setFeedMinutes}
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
