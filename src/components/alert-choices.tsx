"use client";

import { useEffect, useRef, useState } from "react";
import { CareIcon, SectionHeading } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

const fields = [
  ["alert_diaper", "settings.alertDiaper", "diaper"],
  ["alert_feed", "settings.alertFeed", "feed"],
  ["alert_pump", "settings.alertPump", "pump"],
  ["alert_milk", "settings.alertMilk", "feed"],
  ["alert_parts", "settings.alertParts", "chiller"],
] as const;

type Field = (typeof fields)[number][0];

export function AlertChoices() {
  const { t } = useI18n();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<Field, boolean>>({
    alert_diaper: true,
    alert_feed: true,
    alert_pump: true,
    alert_milk: true,
    alert_parts: true,
  });
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) return;
      setFamilyId(context.familyId);
      setUserId(context.userId);
      const supabase = createClient();
      const { data } = await supabase
        .from("member_settings")
        .select("alert_diaper, alert_feed, alert_pump, alert_milk, alert_parts")
        .eq("user_id", context.userId)
        .eq("family_id", context.familyId)
        .maybeSingle();
      if (!data) return;
      setValues({
        alert_diaper: data.alert_diaper !== false,
        alert_feed: data.alert_feed !== false,
        alert_pump: data.alert_pump !== false,
        alert_milk: data.alert_milk !== false,
        alert_parts: data.alert_parts !== false,
      });
    })();
  }, []);

  async function save(field: Field, next: boolean) {
    if (lock.current) return;
    const updated = { ...values, [field]: next };
    setValues(updated);
    if (!userId || !familyId) return;
    lock.current = true;
    setPending(true);
    setNote(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("member_settings")
        .update({ [field]: next })
        .eq("user_id", userId)
        .eq("family_id", familyId);
      setNote(error ? t("common.failed") : t("common.saved"));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <SectionHeading icon="bellRing">{t("settings.alerts")}</SectionHeading>
      <p className="text-sm leading-6 text-muted">{t("settings.alertsHint")}</p>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          <SavingLabel label={t("common.saving")} />
        </p>
      ) : null}
      {fields.map(([field, label, icon]) => (
        <label key={field} className="flex min-h-12 items-center justify-between gap-3 text-base font-semibold">
          <span className="flex items-center gap-2">
            <CareIcon name={icon} className="h-5 w-5 text-accent" />
            {t(label)}
          </span>
          <Switch
            checked={values[field]}
            disabled={pending}
            onCheckedChange={(checked) => void save(field, checked)}
            className="h-6 w-11"
          />
        </label>
      ))}
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </section>
  );
}
