"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BabySwitcher, type SwitchBaby } from "@/components/baby-switcher";
import { CareIcon, type CareIconName } from "@/components/care-icon";
import { ExpiryBar } from "@/components/expiry-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type SheetPump } from "@/components/chiller-sheet";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import type { MessageKey } from "@/i18n/translate";
import { formatBabyAge } from "@/lib/baby-age";
import { CHILLER_LOCATIONS, pumpLabel, type ChillerLocation, type OwnedPump } from "@/lib/device-care";
import { diaperIntervalMinutes, feedIntervalMinutes, DEFAULT_CARE_INTERVAL_MINUTES } from "@/lib/feed-interval";
import { loadRemotePumps } from "@/lib/family-pumps";
import { readQueue } from "@/lib/offline-queue";
import { formatSpan, nowMs } from "@/lib/relative-time";
import { QuickLogDialog, type QuickLogKind } from "@/components/quick-log-dialog";
import { chooseBaby, rememberBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

type Baby = SwitchBaby & {
  intervalMinutes: number | null;
  diaperIntervalMinutes: number | null;
};

type HomeData = {
  familyId: string | null;
  babies: SwitchBaby[];
  baby: Baby | null;
  diaperAt: string | null;
  feedAt: string | null;
  pumpAt: string | null;
  logs: LogRow[];
  chiller: ChillerRow[];
  pumps: OwnedPump[];
};

function logKind(value: string | null): QuickLogKind | null {
  if (
    value === "diaper" ||
    value === "feed" ||
    value === "dbf" ||
    value === "pump" ||
    value === "chiller" ||
    value === "weight"
  ) {
    return value;
  }
  return null;
}

function blankHome(pumps: OwnedPump[]): HomeData {
  return {
    familyId: null,
    babies: [],
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
  babyId: string | null;
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
    babyId: typeof row.baby_id === "string" ? row.baby_id : null,
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
  const params = useSearchParams();
  const requestedLog = logKind(params.get("log"));
  const requestedBaby = params.get("baby");
  const [seenLog, setSeenLog] = useState(requestedLog);
  const [queuedBaby, setQueuedBaby] = useState<string | null>(requestedBaby);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [babies, setBabies] = useState<SwitchBaby[]>([]);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [log, setLog] = useState<QuickLogKind | null>(requestedLog);
  const [diaperAt, setDiaperAt] = useState<string | null>(null);
  const [feedAt, setFeedAt] = useState<string | null>(null);
  const [pumpAt, setPumpAt] = useState<string | null>(null);
  const [chiller, setChiller] = useState<ChillerRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pumps, setPumps] = useState<OwnedPump[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [version, setVersion] = useState(0);
  if (requestedLog !== seenLog) {
    setSeenLog(requestedLog);
    if (requestedLog) setLog(requestedLog);
  }
  if (requestedBaby !== queuedBaby) setQueuedBaby(requestedBaby);
  useEffect(() => {
    if (!params.get("log") && !params.get("baby")) return;
    window.history.replaceState(null, "", "/");
  }, [params]);

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

    const { data: babyRows } = await supabase
      .from("babies")
      .select("id, name, birth_date, photo_path, suggested_interval_minutes, diaper_interval_minutes")
      .eq("family_id", familyId)
      .order("created_at");
    const roster: Baby[] = (babyRows ?? []).flatMap((row) => {
      if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.birth_date !== "string") return [];
      return [
        {
          id: row.id,
          name: row.name,
          birthDate: row.birth_date,
          photoPath: typeof row.photo_path === "string" ? row.photo_path : null,
          intervalMinutes: typeof row.suggested_interval_minutes === "number" ? row.suggested_interval_minutes : null,
          diaperIntervalMinutes: typeof row.diaper_interval_minutes === "number" ? row.diaper_interval_minutes : null,
        },
      ];
    });
    if (queuedBaby && roster.some((entry) => entry.id === queuedBaby)) {
      rememberBaby(familyId, queuedBaby);
    }
    const selectedId = chooseBaby(familyId, roster.map((entry) => entry.id));
    const babyRow = roster.find((baby) => baby.id === selectedId) ?? null;
    const viewBaby = selectedId ?? "00000000-0000-0000-0000-000000000000";

    const [diaperLast, feedLast, pumpLast, recent, chillerRows, reminders] = await Promise.all([
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .eq("kind", "diaper")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .eq("kind", "feed")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .eq("kind", "pump")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("id, kind, occurred_at, amount_ml, diaper_kind, duration_seconds, feed_kind, breast_side, poop_color, poop_amount")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .order("occurred_at", { ascending: false })
        .limit(8),
      supabase
        .from("chiller_items")
        .select("id, type, baby_id, location, stored_at, expires_at, volume_ml, pump_id, note")
        .eq("family_id", familyId)
        .is("cleared_at", null)
        .order("expires_at")
        .limit(40),
      supabase
        .from("reminders")
        .select("reminder_type, next_due_at, chiller_item_id, baby_id")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .eq("enabled", true),
    ]);

    const interval = feedIntervalMinutes(babyRow?.intervalMinutes ?? null);
    const diaperInterval = diaperIntervalMinutes(babyRow?.diaperIntervalMinutes ?? null);
    const reminderFor = (type: string) =>
      (reminders.data ?? []).find(
        (row) => row.reminder_type === type && row.chiller_item_id == null && typeof row.next_due_at === "string",
      )?.next_due_at ?? null;

    const lastDiaper = typeof diaperLast.data?.occurred_at === "string" ? diaperLast.data.occurred_at : null;
    const lastFeed = typeof feedLast.data?.occurred_at === "string" ? feedLast.data.occurred_at : null;
    const lastPump = typeof pumpLast.data?.occurred_at === "string" ? pumpLast.data.occurred_at : null;

    return {
      familyId,
      babies: roster,
      baby: babyRow,
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
  }, [queuedBaby]);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const data = await load();
        if (ignore) return;
        setFamilyId(data.familyId);
        setBabies(data.babies);
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
    babyId: null,
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

  const cards: {
    key: QuickLogKind;
    icon: CareIconName;
    label: string;
    at: string | null;
  }[] = [
    { key: "diaper", icon: "diaper", label: t("home.diaper"), at: diaperAt },
    { key: "feed", icon: "feed", label: t("home.feed"), at: feedAt },
    { key: "pump", icon: "pump", label: t("home.pump"), at: pumpAt },
  ];

  const closeLog = useCallback(() => setLog(null), []);
  const refreshHome = useCallback(async () => {
    const data = await load();
    setFamilyId(data.familyId);
    setBabies(data.babies);
    setBaby(data.baby);
    setDiaperAt(data.diaperAt);
    setFeedAt(data.feedAt);
    setPumpAt(data.pumpAt);
    setLogs(data.logs);
    setChiller(data.chiller);
    setPumps(data.pumps);
  }, [load]);
  const sheetPumps: SheetPump[] = mergedPumps.map((pump) => ({ id: pump.id, label: pumpLabel(pump) }));
  const quick: { key: QuickLogKind; icon: CareIconName; label: string }[] = [
    { key: "diaper", icon: "diaper", label: t("home.diaper") },
    { key: "feed", icon: "feed", label: t("home.feed") },
    { key: "dbf", icon: "dbf", label: t("home.dbf") },
    { key: "pump", icon: "pump", label: t("home.pump") },
    { key: "weight", icon: "weight", label: t("home.weight") },
  ];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        {status === "loading" ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <BabySwitcher
            familyId={familyId}
            babies={babies}
            selectedId={baby?.id ?? null}
            age={status === "ready" ? age : null}
            onChanged={() => setVersion((current) => current + 1)}
          />
        )}
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
        <ul className="grid w-full grid-cols-3 items-stretch gap-2">
          {cards.map((card) => {
            const line = countdownLine(card.at, now, t);
            return (
              <li key={card.key} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setLog(card.key)}
                  aria-label={`${card.label}, ${line.text}`}
                  className={`${SOFT} relative flex h-full min-h-[7.25rem] w-full min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden px-1.5 pt-7 pb-3 text-center ${
                    line.overdue ? "border border-danger" : ""
                  }`}
                >
                  <Badge
                    variant="danger"
                    aria-hidden={line.overdue ? undefined : true}
                    className={`absolute top-1.5 left-1/2 h-4 max-w-[calc(100%-0.75rem)] -translate-x-1/2 truncate px-1.5 py-0 text-[10px] leading-4 ${
                      line.overdue ? "" : "invisible"
                    }`}
                  >
                    {t("home.overdueBadge")}
                  </Badge>
                  <CareIcon
                    name={card.icon}
                    className={`h-8 w-8 shrink-0 ${line.overdue ? "text-danger" : "text-accent"}`}
                  />
                  <span
                    className={`w-full text-[11px] leading-tight font-semibold text-balance ${
                      line.overdue ? "text-danger" : "text-foreground"
                    }`}
                  >
                    {line.text}
                  </span>
                  <span className={`text-xs font-medium ${line.overdue ? "text-danger" : "text-accent"}`}>
                    {card.label}
                  </span>
                </button>
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
              const milkBaby =
                babies.length > 1 && item.type === "milk" && item.babyId
                  ? babies.find((entry) => entry.id === item.babyId)?.name
                  : null;
              const label =
                item.type === "milk"
                  ? `${item.volumeMl ? `${item.volumeMl} ml` : t("chiller.milk")}${milkBaby ? ` · ${milkBaby}` : ""}`
                  : pump
                    ? pumpLabel(pump)
                    : t("chiller.parts");
              const left =
                now === null
                  ? "…"
                  : expired
                    ? t("home.expiredBadge")
                    : t("home.timeLeft", { time: formatSpan(new Date(item.expiresAt).getTime() - now) });
              return (
                <li key={item.id}>
                  <Link
                    href="/chiller"
                    className={`${SOFT} relative flex items-center gap-3 overflow-hidden px-4 py-3 ${expired ? "border border-danger" : ""}`}
                  >
                    <CareIcon
                      name={item.type === "milk" ? "feed" : "chiller"}
                      className={`h-6 w-6 shrink-0 ${expired ? "text-danger" : "text-accent"}`}
                    />
                    <p className={`min-w-0 flex-1 text-sm font-semibold ${expired ? "text-danger" : ""}`}>{label}</p>
                    {expired ? (
                      <Badge variant="danger" className="h-auto shrink-0 px-1.5 py-0 text-sm">
                        {left}
                      </Badge>
                    ) : (
                      <span className="shrink-0 text-right text-sm text-muted">{left}</span>
                    )}
                    <ExpiryBar
                      storedAt={item.storedAt}
                      expiresAt={item.expiresAt}
                      now={now}
                      label={t("chiller.expiryBar")}
                    />
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
              <button
                type="button"
                onClick={() => setLog(item.key)}
                className={`${SOFT} flex min-h-[4.75rem] w-full items-center gap-3 px-4 text-left`}
              >
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <span className="text-base font-semibold">{item.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setLog("chiller")}
              className={`${SOFT} flex min-h-[4.75rem] w-full items-center gap-3 px-4 text-left`}
            >
              <CareIcon name="chiller" className="h-6 w-6 shrink-0 text-accent" />
              <span className="text-base font-semibold">{t("chiller.title")}</span>
            </button>
          </li>
          {quick.slice(4).map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setLog(item.key)}
                className={`${SOFT} flex min-h-[4.75rem] w-full items-center gap-3 px-4 text-left`}
              >
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <span className="text-base font-semibold">{item.label}</span>
              </button>
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

      <QuickLogDialog
        kind={log}
        pumps={sheetPumps}
        babies={babies.map((entry) => ({ id: entry.id, name: entry.name }))}
        babyName={baby?.name ?? null}
        onClose={closeLog}
        onSaved={refreshHome}
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
  return formatBabyAge(birthDate, locale === "id" ? "id" : "en", t);
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
