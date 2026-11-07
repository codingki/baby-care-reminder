"use client";

import { useState } from "react";
import { BabyAvatar } from "@/components/baby-photo";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import { rememberBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

export type SwitchBaby = {
  id: string;
  name: string;
  birthDate: string;
  photoPath: string | null;
};

const sexes = ["female", "male", "unspecified"] as const;

export function BabySwitcher({
  familyId,
  babies,
  selectedId,
  age,
  onChanged,
}: {
  familyId: string | null;
  babies: SwitchBaby[];
  selectedId: string | null;
  age: string | null;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<(typeof sexes)[number]>("unspecified");
  const [weightKg, setWeightKg] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = babies.find((baby) => baby.id === selectedId) ?? babies[0] ?? null;
  const label = selected?.name ?? t("home.addBaby");

  function pick(id: string) {
    if (!familyId) return;
    rememberBaby(familyId, id);
    setOpen(false);
    onChanged();
  }

  async function addBaby() {
    if (!familyId || pending) return;
    const kg = Number(weightKg);
    if (!name.trim() || !birthDate || !Number.isFinite(kg) || kg <= 0) {
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
      })
      .select("id")
      .single();
    setPending(false);
    if (insertError || !data?.id) {
      setError(t("onboarding.error"));
      return;
    }
    rememberBaby(familyId, data.id);
    setAdding(false);
    setOpen(false);
    setName("");
    setBirthDate("");
    setWeightKg("");
    onChanged();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAdding(babies.length === 0);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("home.switchBaby")}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {selected ? (
          <BabyAvatar name={selected.name} path={selected.photoPath} />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e7eee9] text-lg font-semibold text-accent">
            ?
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-2xl font-semibold tracking-tight">{label}</span>
          <span className="block truncate text-sm text-muted">{age || t("home.addBabyDetail")}</span>
        </span>
        <CareIcon name="chevron" className="h-5 w-5 shrink-0 text-muted" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}>
          <div className="safe-x flex shrink-0 items-center justify-between gap-3 pt-4 pb-2">
            <DialogTitle className="text-lg font-semibold">{t("home.switchBaby")}</DialogTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("home.close")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted"
            >
              <CareIcon name="close" className="h-5 w-5" />
            </button>
          </div>
          <DialogDescription className="sr-only">{t("home.addBaby")}</DialogDescription>
          <div className="safe-x flex max-h-80 flex-col gap-2 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            {babies.map((baby) => (
              <button
                key={baby.id}
                type="button"
                onClick={() => pick(baby.id)}
                className="flex min-h-14 items-center gap-3 rounded-2xl bg-[#f3f5f3] px-3 text-left"
              >
                <BabyAvatar name={baby.name} path={baby.photoPath} className="h-10 w-10 text-base" />
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{baby.name}</span>
              </button>
            ))}
            {adding ? (
              <form
                className="flex flex-col gap-3 pt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addBaby();
                }}
              >
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="switch-baby-name">
                  {t("onboarding.name")}
                  <input
                    id="switch-baby-name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="switch-baby-birth">
                  {t("onboarding.birthDate")}
                  <input
                    id="switch-baby-birth"
                    type="date"
                    required
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="switch-baby-sex">
                  {t("onboarding.sex")}
                  <select
                    id="switch-baby-sex"
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
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="switch-baby-weight">
                  {t("onboarding.weightKg")}
                  <input
                    id="switch-baby-weight"
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
                <button
                  type="submit"
                  disabled={pending}
                  aria-busy={pending}
                  className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
                >
                  {pending ? <SavingLabel label={t("common.saving")} /> : t("onboarding.saveBaby")}
                </button>
                {error ? <p className="text-sm">{error}</p> : null}
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left text-base font-semibold text-accent"
              >
                <CareIcon name="chevron" className="h-5 w-5" />
                {t("home.addBaby")}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
