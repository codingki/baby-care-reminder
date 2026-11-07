"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";

const sexes = ["female", "male", "unspecified"] as const;

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<(typeof sexes)[number]>("unspecified");
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      const { data: membership } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (membership?.family_id) setFamilyId(membership.family_id);
    });
  }, []);

  async function createFamily() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setPending(false);
      setError(t("onboarding.signIn"));
      return;
    }
    const { data, error: insertError } = await supabase
      .from("families")
      .insert({ name: familyName.trim(), created_by: userId })
      .select("id")
      .single();
    setPending(false);
    if (insertError || !data) {
      setError(t("onboarding.error"));
      return;
    }
    setFamilyId(data.id);
  }

  async function addBaby() {
    if (!familyId) return;
    const kg = Number(weightKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      setError(t("onboarding.error"));
      return;
    }
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("babies").insert({
      family_id: familyId,
      name: name.trim(),
      birth_date: birthDate,
      sex,
      weight_grams: Math.round(kg * 1000),
      feeding_type: "bottle",
    });
    setPending(false);
    if (insertError) {
      setError(t("onboarding.error"));
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Screen titleKey={familyId ? "onboarding.title" : "onboarding.familyTitle"} ledeKey="onboarding.lede" backHref="/" showLater={false}>
      {familyId === null ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void createFamily();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="family-name">
            {t("onboarding.familyName")}
            <input
              id="family-name"
              required
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t("onboarding.saveFamily")}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void addBaby();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="baby-name">
            {t("onboarding.name")}
            <input
              id="baby-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="baby-birth">
            {t("onboarding.birthDate")}
            <input
              id="baby-birth"
              type="date"
              required
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="baby-sex">
            {t("onboarding.sex")}
            <select
              id="baby-sex"
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
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="baby-weight">
            {t("onboarding.weightKg")}
            <input
              id="baby-weight"
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
          <p className="text-sm text-muted">
            {t("onboarding.feeding")} · {t("onboarding.bottleOnly")}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t("onboarding.saveBaby")}
          </button>
        </form>
      )}
      {error ? (
        <p className="text-sm text-foreground" role="alert">
          {error}
        </p>
      ) : null}
    </Screen>
  );
}
