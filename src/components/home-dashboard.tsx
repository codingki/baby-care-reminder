"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CareIcon, type CareIconName } from "@/components/care-icon";
import { ChillerSheet, type SheetPump } from "@/components/chiller-sheet";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import type { MessageKey } from "@/i18n/translate";
import { babyAgeParts, joinAgeParts } from "@/lib/baby-age";
import { CHILLER_LOCATIONS, pumpLabel, type ChillerLocation, type OwnedPump } from "@/lib/device-care";
import { diaperIntervalMinutes, feedIntervalMinutes, DEFAULT_CARE_INTERVAL_MINUTES } from "@/lib/feed-interval";
import { loadRemotePumps } from "@/lib/family-pumps";
import { readQueue } from "@/lib/offline-queue";
import { formatSpan, nowMs } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/client";

type Baby = {
  name: string;
  birthDate: string;
  intervalMinutes: number | null;
};

type HomeData = {
  baby: Baby | null;
  diaperAt: string | null;
  feedAt: string | null;
  pumpAt: string | null;
  logs: LogRow[];
  chiller: ChillerRow[];
  pumps: OwnedPump[];
};

function blankHome(pumps: OwnedPump[]): HomeData {
  return {
    baby: null,
    diaperAt: null,
    feedAt: null,
    pumpAt: null,
    logs: [],
    chiller: [],
    pumps,
  };
}

type ChillerRow = {
  id: string;
  type: "milk" | "pump_parts";
  location: ChillerLocation;
  storedAt: string;
  expiresAt: string;
  volumeMl: number | null;
  pumpId: string | null;
  note: string | null;
};

type LogRow = {
  id: string;
  kind: string;
  occurredAt: string;
  amountMl: number | null;
  diaperKind: string | null;
  durationSeconds: number | null;
  feedKind: string | null;
  breastSide: string | null;
  poopColor: string | null;
  poopAmount: string | null;
};

type LogKind = "diaper" | "feed" | "pump";

const CARE_MS = DEFAULT_CARE_INTERVAL_MINUTES * 60 * 1000;
const SOFT = "rounded-2xl bg-[#f3f5f3]";

function isLocation(value: string): value is ChillerLocation {
  return (CHILLER_LOCATIONS as readonly string[]).includes(value);
}

function plus(iso: string, ms: number) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function clock(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityWhen(
  iso: string,
  locale: Locale,
  t: (key: "home.todayAt" | "home.yesterdayAt" | "home.dateAt", vars?: Record<string, string>) => string,
) {
  const date = new Date(iso);
  const time = clock(iso, locale);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const yesterday = new Date(start);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= start) return t("home.todayAt", { time });
  if (date >= yesterday) return t("home.yesterdayAt", { time });
  const day = date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    month: "short",
    day: "numeric",
  });
  return t("home.dateAt", { date: day, time });
}

function asLog(id: string, row: Record<string, unknown>): LogRow | null {
  if (typeof row.kind !== "string" || typeof row.occurred_at !== "string") return null;
  return {
    id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    amountMl: typeof row.amount_ml === "number" ? row.amount_ml : null,
    diaperKind: typeof row.diaper_kind === "string" ? row.diaper_kind : null,
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    feedKind: typeof row.feed_kind === "string" ? row.feed_kind : null,
    breastSide: typeof row.breast_side === "string" ? row.breast_side : null,
    poopColor: typeof row.poop_color === "string" ? row.poop_color : null,
    poopAmount: typeof row.poop_amount === "string" ? row.poop_amount : null,
  };
}

function asChiller(id: string, row: Record<string, unknown>): ChillerRow | null {
  if (row.type !== "milk" && row.type !== "pump_parts") return null;
  if (typeof row.location !== "string" || !isLocation(row.location)) return null;
  if (typeof row.stored_at !== "string" || typeof row.expires_at !== "string") return null;
  return {
    id,
    type: row.type,
    location: row.location,
    storedAt: row.stored_at,
    expiresAt: row.expires_at,
    volumeMl: typeof row.volume_ml === "number" ? row.volume_ml : null,
    pumpId: typeof row.pump_id === "string" ? row.pump_id : null,
    note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
  };
}

export function HomeDashboard() {
  const { locale, t } = useI18n();
  const device = useCareStore();
  const [now, setNow] = useState<number | null>(null);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [diaperAt, setDiaperAt] = useState<string | null>(null);
  const [feedAt, setFeedAt] = useState<string | null>(null);
  const [pumpAt, setPumpAt] = useState<string | null>(null);
  const [chiller, setChiller] = useState<ChillerRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pumps, setPumps] = useState<OwnedPump[]>([]);
  const [sheet, setSheet] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const tick = () => setNow(nowMs());
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    const remotePumps = await loadRemotePumps();
    if (!userId) return blankHome(remotePumps ?? []);
    const { data: membership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const familyId = membership?.family_id;
    if (!familyId) return blankHome(remotePumps ?? []);

    const [diaperLast, feedLast, pumpLast, recent, chillerRows, reminders, babies] = await Promise.all([
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("kind", "diaper")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("kind", "feed")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("kind", "pump")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("id, kind, occurred_at, amount_ml, diaper_kind, duration_seconds, feed_kind, breast_side, poop_color, poop_amount")
        .eq("family_id", familyId)
        .order("occurred_at", { ascending: false })
        .limit(8),
      supabase
        .from("chiller_items")
        .select("id, type, location, stored_at, expires_at, volume_ml, pump_id, note")
        .eq("family_id", familyId)
        .is("cleared_at", null)
        .order("expires_at")
        .limit(40),
      supabase
        .from("reminders")
        .select("reminder_type, next_due_at, chiller_item_id")
        .eq("family_id", familyId)
        .eq("enabled", true),
      supabase
        .from("babies")
        .select("name, birth_date, suggested_interval_minutes, diaper_interval_minutes")
        .eq("family_id", familyId)
        .order("created_at")
        .limit(1),
    ]);

    const babyRow = babies.data?.[0];
    const interval = feedIntervalMinutes(
      typeof babyRow?.suggested_interval_minutes === "number" ? babyRow.suggested_interval_minutes : null,
    );
    const diaperInterval = diaperIntervalMinutes(
      typeof babyRow?.diaper_interval_minutes === "number" ? babyRow.diaper_interval_minutes : null,
    );
    const reminderFor = (type: string) =>
      (reminders.data ?? []).find(
        (row) => row.reminder_type === type && row.chiller_item_id == null && typeof row.next_due_at === "string",
      )?.next_due_at ?? null;

    const lastDiaper = typeof diaperLast.data?.occurred_at === "string" ? diaperLast.data.occurred_at : null;
    const lastFeed = typeof feedLast.data?.occurred_at === "string" ? feedLast.data.occurred_at : null;
    const lastPump = typeof pumpLast.data?.occurred_at === "string" ? pumpLast.data.occurred_at : null;

    return {
      baby:
        babyRow && typeof babyRow.name === "string" && typeof babyRow.birth_date === "string"
          ? {
              name: babyRow.name,
              birthDate: babyRow.birth_date,
              intervalMinutes:
                typeof babyRow.suggested_interval_minutes === "number" ? babyRow.suggested_interval_minutes : null,
            }
          : null,
      diaperAt: lastDiaper ? plus(lastDiaper, diaperInterval * 60 * 1000) : reminderFor("diaper"),
      feedAt: lastFeed ? plus(lastFeed, interval * 60 * 1000) : reminderFor("feed"),
      pumpAt: reminderFor("pump") ?? (lastPump ? plus(lastPump, CARE_MS) : null),
      logs: (recent.data ?? []).flatMap((row) => {
        const log = asLog(String(row.id), row as Record<string, unknown>);
        return log ? [log] : [];
      }),
      chiller: (chillerRows.data ?? []).flatMap((row) => {
        const item = asChiller(String(row.id), row as Record<string, unknown>);
        return item ? [item] : [];
      }),
      pumps: remotePumps ?? [],
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const data = await load();
        if (ignore) return;
        setBaby(data.baby);
        setDiaperAt(data.diaperAt);
        setFeedAt(data.feedAt);
        setPumpAt(data.pumpAt);
        setLogs(data.logs);
        setChiller(data.chiller);
        setPumps(data.pumps);
      } finally {
        if (!ignore) setStatus("ready");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [load, version]);

  useEffect(() => {
    const name = baby?.name || t("shell.navHome");
    document.title = `${name} · ${t("shell.brand")}`;
  }, [baby, locale, t]);

  const mergedPumps = mergePumps(pumps, device.pumps);
  const deviceChiller: ChillerRow[] = device.items.filter((item) => !item.clearedAt).map((item) => ({
    id: item.id,
    type: item.type,
    location: item.location,
    storedAt: item.storedAt,
    expiresAt: item.expiresAt,
    volumeMl: item.volumeMl,
    pumpId: item.pumpId,
    note: item.note?.trim() || null,
  }));
  const queuedChiller = readQueue().flatMap((item) => {
    if (item.kind !== "chiller") return [];
    const row = asChiller(typeof item.row.id === "string" ? item.row.id : item.id, item.row);
    return row ? [row] : [];
  });
  const chillerItems = mergeChiller(chiller, [...deviceChiller, ...queuedChiller]);
  const stored = [...chillerItems]
    .sort((left, right) => (left.expiresAt < right.expiresAt ? -1 : 1))
    .slice(0, 3);
  const queuedLogs = readQueue().flatMap((item) => {
    if (item.kind !== "log") return [];
    const log = asLog(item.id, item.row);
    return log ? [log] : [];
  });
  const activities = buildActivity(logs, queuedLogs, chillerItems, mergedPumps, t);

  const age = baby ? ageLabel(baby.birthDate, locale, t) : null;
  const initial = baby ? baby.name.trim().charAt(0).toUpperCase() || "?" : "";

  const cards: {
    key: string;
    href: string;
    icon: CareIconName;
    label: string;
    at: string | null;
  }[] = [
    { key: "diaper", href: "/log/diaper", icon: "diaper", label: t("home.diaper"), at: diaperAt },
    { key: "feed", href: "/log/feed", icon: "feed", label: t("home.feed"), at: feedAt },
    { key: "pump", href: "/log/pump", icon: "pump", label: t("home.pump"), at: pumpAt },
  ];

  const closeSheet = useCallback(() => setSheet(false), []);
  const sheetPumps: SheetPump[] = mergedPumps.map((pump) => ({ id: pump.id, label: pumpLabel(pump) }));
  const quick: { key: string; href?: string; icon: CareIconName; label: string }[] = [
    { key: "diaper", href: "/log/diaper", icon: "diaper", label: t("home.diaper") },
    { key: "feed", href: "/log/feed", icon: "feed", label: t("home.feed") },
    { key: "dbf", href: "/log/dbf", icon: "dbf", label: t("home.dbf") },
    { key: "pump", href: "/log/pump", icon: "pump", label: t("home.pump") },
    { key: "weight", href: "/log/weight", icon: "weight", label: t("home.weight") },
  ];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e7eee9] text-lg font-semibold text-accent">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          {status === "loading" ? (
            <h1 className="truncate text-2xl font-semibold tracking-tight">{t("common.loading")}</h1>
          ) : baby ? (
            <h1 className="truncate text-2xl font-semibold tracking-tight">{baby.name}</h1>
          ) : (
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              <Link href="/onboarding">{t("home.addBaby")}</Link>
            </h1>
          )}
          {status === "ready" ? (
            <p className="text-sm text-muted">{age || t("home.addBabyDetail")}</p>
          ) : null}
        </div>
        <Link
          href="/settings"
          aria-label={t("shell.navSettings")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground"
        >
          <CareIcon name="settings" className="h-6 w-6" />
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">{t("home.nextUp")}</h2>
        <ul className="grid grid-cols-3 gap-2">
          {cards.map((card) => {
            const line = countdownLine(card.at, now, t);
            return (
              <li key={card.key}>
                <Link
                  href={card.href}
                  aria-label={`${card.label}, ${line.text}`}
                  className={`${SOFT} flex min-h-[7.25rem] flex-col items-center justify-center gap-1.5 px-1 py-3 text-center`}
                >
                  <CareIcon name={card.icon} className="h-8 w-8 text-accent" />
                  <span
                    className={`max-w-full px-0.5 text-[11px] leading-tight font-semibold whitespace-nowrap ${
                      line.overdue ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {line.text}
                  </span>
                  <span className="text-xs font-medium text-accent">{card.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {stored.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">{t("home.inChiller")}</h2>
            <Link href="/chiller" className="text-sm font-semibold text-accent">
              {t("home.seeAll")}
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {stored.map((item) => {
              const expired = now !== null && new Date(item.expiresAt).getTime() < now;
              const pump = mergedPumps.find((entry) => entry.id === item.pumpId);
              const label =
                item.type === "milk"
                  ? item.volumeMl
                    ? `${item.volumeMl} ml`
                    : t("chiller.milk")
                  : pump
                    ? pumpLabel(pump)
                    : t("chiller.parts");
              const left =
                now === null
                  ? "…"
                  : expired
                    ? t("home.expired")
                    : t("home.timeLeft", { time: formatSpan(new Date(item.expiresAt).getTime() - now) });
              return (
                <li key={item.id}>
                  <Link href="/chiller" className={`${SOFT} flex items-center gap-3 px-4 py-3`}>
                    <CareIcon
                      name={item.type === "milk" ? "feed" : "chiller"}
                      className="h-6 w-6 shrink-0 text-accent"
                    />
                    <p className="min-w-0 text-sm">
                      <span className="font-semibold">{label}</span>
                      <span className="text-muted"> · </span>
                      <span className={expired ? "font-semibold text-accent" : "text-muted"}>{left}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">{t("home.title")}</h2>
        <ul className="grid grid-cols-2 gap-2">
          {quick.slice(0, 4).map((item) => (
            <li key={item.key}>
              <Link href={item.href ?? "/"} className={`${SOFT} flex min-h-[4.75rem] items-center gap-3 px-4`}>
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <span className="text-base font-semibold">{item.label}</span>
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setSheet(true)}
              className={`${SOFT} flex min-h-[4.75rem] w-full items-center gap-3 px-4 text-left`}
            >
              <CareIcon name="chiller" className="h-6 w-6 shrink-0 text-accent" />
              <span className="text-base font-semibold">{t("chiller.title")}</span>
            </button>
          </li>
          {quick.slice(4).map((item) => (
            <li key={item.key}>
              <Link href={item.href ?? "/"} className={`${SOFT} flex min-h-[4.75rem] items-center gap-3 px-4`}>
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <span className="text-base font-semibold">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">{t("home.recentActivity")}</h2>
          <Link href="/timeline" className="text-sm font-semibold text-accent">
            {t("home.seeAll")}
          </Link>
        </div>
        {activities.length === 0 ? (
          <p className={`${SOFT} px-4 py-4 text-sm text-muted`}>{t("home.recentEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((item) => (
              <li key={item.id} className={`${SOFT} flex items-center gap-3 px-4 py-3`}>
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.detail ? <p className="truncate text-sm text-muted">{item.detail}</p> : null}
                </div>
                <p className="max-w-[7.5rem] shrink-0 text-right text-xs leading-4 text-muted">
                  {activityWhen(item.at, locale, t)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ChillerSheet
        open={sheet}
        pumps={sheetPumps}
        onClose={closeSheet}
        onSaved={() => setVersion((current) => current + 1)}
      />
    </section>
  );
}

function countdownLine(
  at: string | null,
  now: number | null,
  t: (key: "home.notYet" | "home.overdue" | "home.inRelative", vars?: Record<string, string>) => string,
) {
  if (now === null) return { text: "…", overdue: false };
  if (!at) return { text: t("home.notYet"), overdue: false };
  const remaining = new Date(at).getTime() - now;
  const span = formatSpan(remaining);
  if (remaining < 0) return { text: t("home.overdue", { time: span }), overdue: true };
  return { text: t("home.inRelative", { time: span }), overdue: false };
}

function ageLabel(birthDate: string, locale: Locale, t: (key: MessageKey, vars?: Record<string, string>) => string) {
  const age = babyAgeParts(birthDate);
  if (!age) return "";
  const parts: string[] = [];
  if (age.months === 1) parts.push(t("home.monthOne"));
  else if (age.months > 1) parts.push(t("home.monthMany", { count: String(age.months) }));
  if (age.weeks === 1) parts.push(t("home.weekOne"));
  else if (age.weeks > 1) parts.push(t("home.weekMany", { count: String(age.weeks) }));
  if (age.days === 1) parts.push(t("home.dayOne"));
  else if (age.days > 1) parts.push(t("home.dayMany", { count: String(age.days) }));
  if (parts.length === 0) parts.push(t("home.dayMany", { count: "0" }));
  return t("home.ageOld", { age: joinAgeParts(parts, locale === "id" ? "id" : "en") });
}

function mergePumps(remote: OwnedPump[], local: OwnedPump[]) {
  const ids = new Set(remote.map((pump) => pump.id));
  return [...local.filter((pump) => !ids.has(pump.id)), ...remote];
}

function mergeChiller(remote: ChillerRow[], extra: ChillerRow[]) {
  const byId = new Map<string, ChillerRow>();
  for (const item of remote) byId.set(item.id, item);
  for (const item of extra) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function buildActivity(
  logs: LogRow[],
  queued: LogRow[],
  chiller: ChillerRow[],
  pumps: OwnedPump[],
  t: (key: MessageKey, vars?: Record<string, string>) => string,
) {
  const seen = new Set(logs.map((log) => log.id));
  const rows: { id: string; at: string; icon: CareIconName; title: string; detail: string }[] = [
    ...queued.filter((log) => !seen.has(log.id)),
    ...logs,
  ].flatMap((log) => {
    const kind = activityKind(log.kind);
    if (!kind) return [];
    const breast = log.feedKind === "breast";
    const detail = logDetail(log, t);
    return [
      {
        id: log.id,
        at: log.occurredAt,
        icon: breast ? "dbf" : kind,
        title: breast ? `${t("home.dbf")} · ${detail}` : t(titleKey(kind)),
        detail: breast ? "" : detail,
      },
    ];
  });
  for (const item of chiller) {
    const pump = pumps.find((entry) => entry.id === item.pumpId);
    const detail =
      item.type === "milk"
        ? [item.volumeMl ? `${item.volumeMl} ml` : null, t(`chiller.${item.location}`)].filter(Boolean).join(" · ")
        : pump
          ? pumpLabel(pump)
          : "";
    rows.push({
      id: item.id,
      at: item.storedAt,
      icon: "chiller",
      title: item.type === "milk" ? t("chiller.milk") : t("chiller.parts"),
      detail,
    });
  }
  return rows.sort((left, right) => (left.at < right.at ? 1 : -1)).slice(0, 8);
}

function activityKind(kind: string): LogKind | null {
  if (kind === "diaper" || kind === "feed" || kind === "pump") return kind;
  return null;
}

function titleKey(kind: LogKind): "home.diaper" | "home.feed" | "home.pump" {
  if (kind === "feed") return "home.feed";
  if (kind === "pump") return "home.pump";
  return "home.diaper";
}

function poopLabel(
  value: string | null,
  group: "color" | "amount",
  t: (key: MessageKey, vars?: Record<string, string>) => string,
) {
  const colors = ["yellow", "green", "brown", "black", "red", "white"] as const;
  const amounts = ["small", "medium", "large"] as const;
  if (group === "color" && colors.some((color) => color === value)) return t(`diaper.${value as (typeof colors)[number]}`);
  if (group === "amount" && amounts.some((amount) => amount === value)) {
    return t(`diaper.${value as (typeof amounts)[number]}`);
  }
  return "";
}

function logDetail(log: LogRow, t: (key: MessageKey, vars?: Record<string, string>) => string) {
  if (log.kind === "diaper") {
    const kind =
      log.diaperKind === "wet"
        ? t("diaper.wet")
        : log.diaperKind === "dirty"
          ? t("diaper.dirty")
          : log.diaperKind === "mixed"
            ? t("diaper.both")
            : log.diaperKind === "dry"
              ? t("diaper.dry")
              : "";
    const color = poopLabel(log.poopColor, "color", t);
    const amount = poopLabel(log.poopAmount, "amount", t);
    return [kind, color, amount].filter(Boolean).join(" · ");
  }
  if (log.kind === "feed" && log.feedKind === "breast") {
    const side = log.breastSide === "right" ? t("dbf.right") : t("dbf.left");
    const minutes =
      log.durationSeconds && log.durationSeconds > 0
        ? t("home.durationMinutes", { count: String(Math.max(1, Math.round(log.durationSeconds / 60))) })
        : "";
    return [side, minutes].filter(Boolean).join(" · ");
  }
  if (log.kind === "feed") return log.amountMl ? `${log.amountMl} ml` : "";
  if (log.kind === "pump") {
    const amount = log.amountMl ? `${log.amountMl} ml` : "";
    const minutes =
      log.durationSeconds && log.durationSeconds > 0
        ? t("home.durationMinutes", { count: String(Math.max(1, Math.round(log.durationSeconds / 60))) })
        : "";
    return [amount, minutes].filter(Boolean).join(" · ");
  }
  return "";
}
