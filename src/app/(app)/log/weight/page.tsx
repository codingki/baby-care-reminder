"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useSaveLock } from "@/components/use-save-lock";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

function todayInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function WeightPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useSaveLock();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(todayInput);
  const [message, setMessage] = useState<string | null>(null);
  const parsed = Number(kg);
  const ready = Number.isFinite(parsed) && parsed > 0 && date.length > 0;

  async function save() {
    if (!ready) return;
    setMessage(null);
    await run(async () => {
      const context = await loadFamilyContext();
      if (!context?.babyId) {
        router.push("/onboarding");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.from("weight_logs").insert({
        baby_id: context.babyId,
        family_id: context.familyId,
        logged_by: context.userId,
        weight_grams: Math.round(parsed * 1000),
        weighed_on: date,
      });
      if (error) {
        setMessage(t("common.failed"));
        return;
      }
      setMessage(t("common.saved"));
      router.push("/family");
    });
  }

  return (
    <Screen
      titleKey="weight.title"
      ledeKey="weight.lede"
      backHref="/"
      showLater={false}
      icon={<CareIcon name="weight" className="h-8 w-8" />}
    >
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="weight-kg">
        {t("weight.kg")}
        <input
          id="weight-kg"
          type="number"
          inputMode="decimal"
          min={0.01}
          step={0.01}
          value={kg}
          onChange={(event) => setKg(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="weight-date">
        {t("weight.date")}
        <input
          id="weight-date"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={pending || !ready}
        aria-busy={pending}
        className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </Screen>
  );
}
