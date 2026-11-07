"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { clampWashByHours, setWashByHours } from "@/lib/device-care";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

export function WashByHours() {
  const { t } = useI18n();
  const { washByHours } = useCareStore();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lock = useRef(false);
  const latest = useRef(washByHours);

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context) setWashByHours(context.washByHours);
    });
  }, []);

  async function change(hours: number) {
    const next = clampWashByHours(hours);
    setWashByHours(next);
    latest.current = next;
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setNote(null);
    try {
      let saved = next;
      for (;;) {
        const target = latest.current;
        const context = await loadFamilyContext();
        if (!context) {
          setNote(t("common.failed"));
          break;
        }
        const supabase = createClient();
        const { error } = await supabase
          .from("families")
          .update({ pump_parts_wash_by_hours: target })
          .eq("id", context.familyId);
        if (error) {
          setNote(t("common.failed"));
          break;
        }
        saved = target;
        if (latest.current === saved) break;
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <SectionHeading icon="clock">{t("settings.washBy")}</SectionHeading>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          <SavingLabel label={t("common.saving")} />
        </p>
      ) : null}
      <p className="text-base font-semibold">{t("settings.washByHours", { hours: String(washByHours) })}</p>
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="wash-by-hours">
        {t("settings.washByHint")}
        <Input
          id="wash-by-hours"
          type="number"
          inputMode="numeric"
          min={1}
          max={24}
          step={1}
          value={washByHours}
          onChange={(event) => void change(Number(event.target.value))}
          className="bg-background px-3"
        />
      </label>
      {note ? (
        <p role="alert" className="text-sm">
          {note}
        </p>
      ) : null}
    </Card>
  );
}
