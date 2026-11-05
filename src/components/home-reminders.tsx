"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import type { ChillerItem, OwnedPump } from "@/lib/device-care";
import { matchGuideline, type FeedingGuideline } from "@/lib/feeding";
import { formatSpan, nowMs } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/client";

type ReminderRow = {
  id: string;
  reminder_type: string;
  next_due_at: string;
};

type ChillerRow = {
  id: string;
  type: "milk" | "pump_parts";
  expires_at: string;
  volume_ml: number | null;
  pump_id: string | null;
};

type PumpRow = {
  id: string;
  nickname: string | null;
  custom_name: string | null;
  pump_model_id: string | null;
};

type ModelRow = { id: string; model: string };

type LogRow = {
  id: string;
  kind: string;
  occurred_at: string;
  amount_ml: number | null;
  diaper_kind: string | null;
};

type BabyRow = {
  id: string;
  name: string;
  birth_date: string;
  weight_grams: number | null;
  suggested_ml: number | null;
  suggested_interval_minutes: number | null;
};

type LiveData = {
  reminders: ReminderRow[];
  chiller: ChillerRow[];
  pumps: PumpRow[];
  models: ModelRow[];
  logs: LogRow[];
  babies: BabyRow[];
  guidelines: FeedingGuideline[];
};

function clockTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function pumpName(row: ChillerRow, pumps: PumpRow[], models: ModelRow[]) {
  const pump = pumps.find((entry) => entry.id === row.pump_id);
  if (!pump) return "";
  if (pump.nickname) return pump.nickname;
  if (pump.custom_name) return pump.custom_name;
  return models.find((model) => model.id === pump.pump_model_id)?.model ?? "";
}

export function HomeReminders() {
  const { locale, t } = useI18n();
  const device = useCareStore();
  const [now, setNow] = useState(nowMs);
  const [clockIds, setClockIds] = useState<ReadonlySet<string>>(new Set());
  const [live, setLive] = useState<LiveData | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data: membership } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      const familyId = membership?.family_id;
      if (!familyId) return;
      const [reminders, chiller, pumps, models, logs, babies, guidelines] = await Promise.all([
        supabase
          .from("reminders")
          .select("id, reminder_type, next_due_at")
          .eq("family_id", familyId)
          .eq("enabled", true)
          .order("next_due_at"),
        supabase
          .from("chiller_items")
          .select("id, type, expires_at, volume_ml, pump_id")
          .eq("family_id", familyId)
          .order("expires_at"),
        supabase
          .from("family_pumps")
          .select("id, nickname, custom_name, pump_model_id")
          .eq("family_id", familyId),
        supabase.from("pump_models").select("id, model"),
        supabase
          .from("logs")
          .select("id, kind, occurred_at, amount_ml, diaper_kind")
          .eq("family_id", familyId)
          .order("occurred_at", { ascending: false })
          .limit(8),
        supabase
          .from("babies")
          .select("id, name, birth_date, weight_grams, suggested_ml, suggested_interval_minutes")
          .eq("family_id", familyId),
        supabase
          .from("feeding_guidelines")
          .select(
            "age_min_days, age_max_days, weight_min_grams, weight_max_grams, suggested_ml, interval_minutes",
          ),
      ]);
      if (reminders.error || chiller.error) return;
      setLive({
        reminders: (reminders.data ?? []) as ReminderRow[],
        chiller: (chiller.data ?? []) as ChillerRow[],
        pumps: (pumps.data ?? []) as PumpRow[],
        models: (models.data ?? []) as ModelRow[],
        logs: (logs.data ?? []) as LogRow[],
        babies: (babies.data ?? []) as BabyRow[],
        guidelines: (guidelines.data ?? []) as FeedingGuideline[],
      });
    })();
  }, []);

  const deviceItems = [...device.items].sort((left, right) =>
    left.expiresAt < right.expiresAt ? -1 : 1,
  );
  const useLive = live !== null && (live.reminders.length > 0 || live.chiller.length > 0 || live.logs.length > 0);

  return (
    <>
      <NextUp
        locale={locale}
        now={now}
        clockIds={clockIds}
        onToggle={(id) =>
          setClockIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        rows={
          useLive && live
            ? live.reminders.map((row) => ({
                id: row.id,
                label: labelFor(row.reminder_type, t),
                at: row.next_due_at,
              }))
            : deviceItems.map((item) => ({
                id: item.id,
                label: item.type === "milk" ? t("chiller.milk") : deviceName(item, device.pumps),
                at: item.expiresAt,
              }))
        }
      />
      <InChiller
        now={now}
        rows={
          useLive && live
            ? live.chiller.slice(0, 3).map((item) => ({
                id: item.id,
                expired: new Date(item.expires_at).getTime() < now,
                text:
                  item.type === "milk"
                    ? `${item.volume_ml ?? 0} ml`
                    : pumpName(item, live.pumps, live.models),
                when: item.expires_at,
              }))
            : deviceItems.slice(0, 3).map((item) => ({
                id: item.id,
                expired: new Date(item.expiresAt).getTime() < now,
                text: item.type === "milk" ? `${item.volumeMl ?? 0} ml` : deviceName(item, device.pumps),
                when: item.expiresAt,
              }))
        }
      />
      {live ? <Suggestions babies={live.babies} guidelines={live.guidelines} /> : null}
      {live && live.logs.length > 0 ? <Recent logs={live.logs} locale={locale} /> : null}
    </>
  );
}

function deviceName(item: ChillerItem, pumps: OwnedPump[]) {
  const pump = pumps.find((entry) => entry.id === item.pumpId);
  if (!pump) return "";
  return pump.nickname ?? pump.model ?? pump.customName ?? "";
}

function labelFor(type: string, t: (key: "chiller.milk" | "chiller.parts" | "diaper.title" | "feed.title" | "pump.title") => string) {
  if (type === "pump_parts") return t("chiller.parts");
  if (type === "diaper") return t("diaper.title");
  if (type === "feed") return t("feed.title");
  if (type === "pump") return t("pump.title");
  return t("chiller.milk");
}

function NextUp({
  rows,
  now,
  locale,
  clockIds,
  onToggle,
}: {
  rows: { id: string; label: string; at: string }[];
  now: number;
  locale: Locale;
  clockIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted">{t("home.nextUp")}</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const remaining = new Date(row.at).getTime() - now;
          const overdue = remaining < 0;
          const span = formatSpan(remaining);
          const relative = overdue ? t("home.overdue", { time: span }) : t("home.inRelative", { time: span });
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 text-left text-sm"
              >
                <span className="font-semibold">{row.label}</span>
                <span className={overdue ? "font-semibold text-accent" : "text-muted"}>
                  {clockIds.has(row.id) ? clockTime(row.at, locale) : relative}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InChiller({
  rows,
  now,
}: {
  rows: { id: string; text: string; when: string; expired: boolean }[];
  now: number;
}) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">{t("home.inChiller")}</h2>
        <Link href="/chiller" className="text-sm font-semibold text-accent">
          {t("home.seeAll")}
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const when = row.expired
            ? t("home.expired")
            : t("home.timeLeft", { time: formatSpan(new Date(row.when).getTime() - now) });
          return (
            <li key={row.id}>
              <Link
                href={`/chiller/${row.id}`}
                className="flex min-h-12 items-center rounded-2xl border border-line bg-card px-4 text-sm"
              >
                <span className="font-semibold">{row.text}</span>
                <span className="text-muted"> · </span>
                <span className={row.expired ? "font-semibold text-accent" : undefined}>{when}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Suggestions({
  babies,
  guidelines,
}: {
  babies: BabyRow[];
  guidelines: FeedingGuideline[];
}) {
  if (babies.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {babies.map((baby) => (
        <SuggestionCard key={baby.id} baby={baby} guidelines={guidelines} />
      ))}
    </div>
  );
}

function SuggestionCard({ baby, guidelines }: { baby: BabyRow; guidelines: FeedingGuideline[] }) {
  const { t } = useI18n();
  const guide = matchGuideline(guidelines, baby.birth_date, baby.weight_grams);
  const ml = baby.suggested_ml ?? guide?.suggested_ml ?? null;
  const interval = baby.suggested_interval_minutes ?? guide?.interval_minutes ?? null;
  const [draftMl, setDraftMl] = useState(baby.suggested_ml ? String(baby.suggested_ml) : "");
  const [draftMinutes, setDraftMinutes] = useState(
    baby.suggested_interval_minutes ? String(baby.suggested_interval_minutes) : "",
  );
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const supabase = createClient();
    const suggestedMl = draftMl.trim() === "" ? null : Number(draftMl);
    const suggestedInterval = draftMinutes.trim() === "" ? null : Number(draftMinutes);
    await supabase
      .from("babies")
      .update({
        suggested_ml: suggestedMl && suggestedMl > 0 ? Math.round(suggestedMl) : null,
        suggested_interval_minutes:
          suggestedInterval && suggestedInterval > 0 ? Math.round(suggestedInterval) : null,
      })
      .eq("id", baby.id);
    setPending(false);
  }

  if (ml === null || interval === null) return null;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-sm font-semibold">
        {baby.name} · {t("home.suggestion", { ml: String(ml), time: formatSpan(interval * 60000) })}
      </p>
      <p className="text-sm text-muted">{t("home.pediatrician")}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          aria-label="ml"
          inputMode="numeric"
          value={draftMl}
          placeholder={String(guide?.suggested_ml ?? ml)}
          onChange={(event) => setDraftMl(event.target.value)}
          className="min-h-12 rounded-2xl border border-line px-3 text-base"
        />
        <input
          aria-label="minutes"
          inputMode="numeric"
          value={draftMinutes}
          placeholder={String(guide?.interval_minutes ?? interval)}
          onChange={(event) => setDraftMinutes(event.target.value)}
          className="min-h-12 rounded-2xl border border-line px-3 text-base"
        />
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void save()}
        className="min-h-12 rounded-2xl bg-accent text-sm font-semibold text-accent-foreground"
      >
        {t("home.saveSuggestion")}
      </button>
    </section>
  );
}

function Recent({ logs, locale }: { logs: LogRow[]; locale: Locale }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted">{t("home.recent")}</h2>
      <ul className="flex flex-col gap-2">
        {logs.map((log) => (
          <li key={log.id} className="text-sm">
            <span className="font-semibold">{labelFor(log.kind, t)}</span>
            {log.amount_ml ? <span> · {log.amount_ml} ml</span> : null}
            {log.diaper_kind ? <span> · {log.diaper_kind}</span> : null}
            <span className="text-muted"> · {clockTime(log.occurred_at, locale)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
