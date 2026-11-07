"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SectionHeading } from "@/components/care-icon";
import { MINUTE_PRESETS, PresetChips } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { useSaveLock } from "@/components/use-save-lock";
import { useI18n } from "@/i18n/provider";
import {
  DEFAULT_DIAPER_INTERVAL_MINUTES,
  DEFAULT_FEED_INTERVAL_MINUTES,
  diaperIntervalMinutes,
  feedIntervalMinutes,
} from "@/lib/feed-interval";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

export function BabySettings() {
  const { t } = useI18n();
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
          String(
            feedIntervalMinutes(
              typeof data.suggested_interval_minutes === "number" ? data.suggested_interval_minutes : null,
            ),
          ),
        );
        setDiaperMinutes(
          String(
            diaperIntervalMinutes(
              typeof data.diaper_interval_minutes === "number" ? data.diaper_interval_minutes : null,
            ),
          ),
        );
      }
      setReady(true);
    })();
  }, []);

  async function save() {
    const trimmed = name.trim();
    const parsed = Number(minutes);
    const parsedDiaper = Number(diaperMinutes);
    if (
      !babyId ||
      !trimmed ||
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      !Number.isFinite(parsedDiaper) ||
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
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
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
            <input
              id="baby-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-interval">
              {t("settings.feedInterval")}
              <input
                id="feed-interval"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
              />
              <PresetChips values={MINUTE_PRESETS} onPick={(value) => setMinutes(String(value))} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="diaper-interval">
              {t("settings.diaperInterval")}
              <input
                id="diaper-interval"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={diaperMinutes}
                onChange={(event) => setDiaperMinutes(event.target.value)}
                className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
              />
              <PresetChips values={MINUTE_PRESETS} onPick={(value) => setDiaperMinutes(String(value))} />
            </label>
          </div>
          <p className="text-sm leading-6 text-muted">{t("settings.feedIntervalHint")}</p>
          <p className="text-sm leading-6 text-muted">{t("settings.diaperIntervalHint")}</p>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </button>
        </form>
      ) : null}
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </section>
  );
}
