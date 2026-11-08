"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SectionHeading } from "@/components/care-icon";
import { MINUTE_PRESETS, PresetChips } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DecimalInput } from "@/components/decimal-input";
import { Input } from "@/components/ui/input";
import { useSaveLock } from "@/components/use-save-lock";
import { useI18n } from "@/i18n/provider";
import { formatDecimal, parseDecimal } from "@/lib/decimal";
import {
  DEFAULT_DIAPER_INTERVAL_MINUTES,
  DEFAULT_FEED_INTERVAL_MINUTES,
  diaperIntervalMinutes,
  feedIntervalMinutes,
} from "@/lib/feed-interval";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

export function BabySettings() {
  const { locale, t } = useI18n();
  const { pending, run } = useSaveLock();
  const [babyId, setBabyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(String(DEFAULT_FEED_INTERVAL_MINUTES));
  const [diaperMinutes, setDiaperMinutes] = useState(String(DEFAULT_DIAPER_INTERVAL_MINUTES));
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context?.babyId) {
        setReady(true);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("babies")
        .select("id, name, suggested_interval_minutes, diaper_interval_minutes")
        .eq("id", context.babyId)
        .maybeSingle();
      if (data && typeof data.name === "string") {
        setBabyId(String(data.id));
        setName(data.name);
        setMinutes(
          formatDecimal(
            feedIntervalMinutes(
              typeof data.suggested_interval_minutes === "number" ? data.suggested_interval_minutes : null,
            ),
            locale,
          ),
        );
        setDiaperMinutes(
          formatDecimal(
            diaperIntervalMinutes(
              typeof data.diaper_interval_minutes === "number" ? data.diaper_interval_minutes : null,
            ),
            locale,
          ),
        );
      }
      setReady(true);
    })();
  }, [locale]);

  async function save() {
    const trimmed = name.trim();
    const parsed = parseDecimal(minutes);
    const parsedDiaper = parseDecimal(diaperMinutes);
    if (
      !babyId ||
      !trimmed ||
      parsed === null ||
      parsed <= 0 ||
      parsedDiaper === null ||
      parsedDiaper <= 0
    ) {
      setNote(t("common.failed"));
      return;
    }
    const rounded = Math.round(parsed);
    const roundedDiaper = Math.round(parsedDiaper);
    setNote(null);
    await run(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("babies")
        .update({
          name: trimmed,
          suggested_interval_minutes: rounded,
          diaper_interval_minutes: roundedDiaper,
        })
        .eq("id", babyId);
      if (error) {
        setNote(t("common.failed"));
        return;
      }
      const [lastFeed, lastDiaper] = await Promise.all([
        supabase
          .from("logs")
          .select("occurred_at")
          .eq("baby_id", babyId)
          .eq("kind", "feed")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("logs")
          .select("occurred_at")
          .eq("baby_id", babyId)
          .eq("kind", "diaper")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (typeof lastFeed.data?.occurred_at === "string") {
        const due = new Date(new Date(lastFeed.data.occurred_at).getTime() + rounded * 60 * 1000).toISOString();
        await supabase
          .from("reminders")
          .update({ next_due_at: due, notified_at: null, enabled: true })
          .eq("baby_id", babyId)
          .eq("reminder_type", "feed")
          .is("chiller_item_id", null);
      }
      if (typeof lastDiaper.data?.occurred_at === "string") {
        const due = new Date(
          new Date(lastDiaper.data.occurred_at).getTime() + roundedDiaper * 60 * 1000,
        ).toISOString();
        await supabase
          .from("reminders")
          .update({ next_due_at: due, notified_at: null, enabled: true })
          .eq("baby_id", babyId)
          .eq("reminder_type", "diaper")
          .is("chiller_item_id", null);
      }
      setName(trimmed);
      setMinutes(String(rounded));
      setDiaperMinutes(String(roundedDiaper));
      setNote(t("common.saved"));
    });
  }

  return (
    <Card className="gap-3 p-4">
      <SectionHeading icon="baby">{t("settings.baby")}</SectionHeading>
      {!ready ? (
        <p className="text-sm text-muted" role="status">
          {t("common.loading")}
        </p>
      ) : null}
      {ready && !babyId ? (
        <p className="text-sm leading-6">
          {t("settings.noBaby")}{" "}
          <Link href="/onboarding" className="font-semibold text-accent">
            {t("home.addBaby")}
          </Link>
        </p>
      ) : null}
      {babyId ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="baby-name">
            {t("settings.babyName")}
            <Input
              id="baby-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bg-background px-3"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-interval">
              {t("settings.feedInterval")}
              <DecimalInput
                locale={locale}
                id="feed-interval"
                required
                value={minutes}
                onValueChange={setMinutes}
                className="bg-background px-3"
              />
              <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="diaper-interval">
              {t("settings.diaperInterval")}
              <DecimalInput
                locale={locale}
                id="diaper-interval"
                required
                value={diaperMinutes}
                onValueChange={setDiaperMinutes}
                className="bg-background px-3"
              />
              <PresetChips values={MINUTE_PRESETS} onPick={(value) => setDiaperMinutes(String(value))} />
            </label>
          </div>
          <p className="text-sm leading-6 text-muted">{t("settings.feedIntervalHint")}</p>
          <p className="text-sm leading-6 text-muted">{t("settings.diaperIntervalHint")}</p>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </Button>
        </form>
      ) : null}
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </Card>
  );
}
