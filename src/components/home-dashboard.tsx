"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { focusBaby, scopedKey, scopeFromKey, useScope, type CareScope } from "@/lib/care-queries";
import { useLiveChiller } from "@/lib/chiller-cache";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BabySwitcher, type SwitchBaby } from "@/components/baby-switcher";
import { CareIcon, type CareIconName } from "@/components/care-icon";
import { EditEntryDialog, type ChillerEdit, type LogEdit } from "@/components/edit-entry";
import { ExpiryBar } from "@/components/expiry-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type SheetPump } from "@/components/chiller-sheet";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import type { MessageKey } from "@/i18n/translate";
import { formatBabyAge } from "@/lib/baby-age";
import { CHILLER_LOCATIONS, pumpLabel, type ChillerLocation, type OwnedPump } from "@/lib/device-care";
import { diaperIntervalMinutes, feedIntervalMinutes } from "@/lib/feed-interval";
import { pumpCardTimes } from "@/lib/pump-schedule";
import { loadRemotePumps } from "@/lib/family-pumps";
import { readQueue } from "@/lib/offline-queue";
import { formatSpan, nowMs } from "@/lib/relative-time";
import { QuickLogDialog, type QuickLogKind } from "@/components/quick-log-dialog";
import { chooseBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

type Baby = SwitchBaby & {
  intervalMinutes: number | null;
  diaperIntervalMinutes: number | null;
};

type HomeData = {
  userId: string | null;
  familyId: string | null;
  babies: SwitchBaby[];
  baby: Baby | null;
  diaperAt: string | null;
  feedAt: string | null;
  pumpHours: number[];
  pumpDays: number[];
  pumpTimeZone: string;
  lastFamilyPump: string | null;
  diaperStart: string | null;
  feedStart: string | null;
  logs: LogRow[];
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
  const [log, setLog] = useState<QuickLogKind | null>(requestedLog);
  const [editing, setEditing] = useState<{ log: LogEdit | null; chiller: ChillerEdit | null } | null>(null);
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

  const load = useCallback(async (scope: CareScope) => {
    const supabase = createClient();
    const userId = scope.userId;
    const familyId = scope.familyId;
    const remotePumps = await loadRemotePumps();

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
    const selectedId = roster.some((entry) => entry.id === scope.babyId) ? scope.babyId : null;
    const babyRow = roster.find((baby) => baby.id === selectedId) ?? null;
    const viewBaby = selectedId ?? "00000000-0000-0000-0000-000000000000";

    const [diaperLast, feedLast, familyPump, scheduleRow, recent, reminders] = await Promise.all([
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .eq("kind", "diaper")
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .eq("kind", "feed")
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("occurred_at")
        .eq("family_id", familyId)
        .eq("kind", "pump")
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("families")
        .select("pump_hours, pump_days, pump_schedule_timezone")
        .eq("id", familyId)
        .maybeSingle(),
      supabase
        .from("logs")
        .select("id, kind, occurred_at, amount_ml, diaper_kind, duration_seconds, feed_kind, breast_side, poop_color, poop_amount")
        .eq("family_id", familyId)
        .eq("baby_id", viewBaby)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(8),
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
    const schedule = scheduleRow.data;

    return {
      userId,
      familyId,
      babies: roster,
      baby: babyRow,
      diaperAt: lastDiaper ? plus(lastDiaper, diaperInterval * 60 * 1000) : reminderFor("diaper"),
      feedAt: lastFeed ? plus(lastFeed, interval * 60 * 1000) : reminderFor("feed"),
      pumpHours: Array.isArray(schedule?.pump_hours) ? schedule.pump_hours.filter((hour) => typeof hour === "number") : [],
      pumpDays: Array.isArray(schedule?.pump_days) ? schedule.pump_days.filter((day) => typeof day === "number") : [1, 2, 3, 4, 5, 6, 7],
      pumpTimeZone: typeof schedule?.pump_schedule_timezone === "string" ? schedule.pump_schedule_timezone : "UTC",
      lastFamilyPump: typeof familyPump.data?.occurred_at === "string" ? familyPump.data.occurred_at : null,
      diaperStart: lastDiaper,
      feedStart: lastFeed,
      logs: (recent.data ?? []).flatMap((row) => {
        const log = asLog(String(row.id), row as Record<string, unknown>);
        return log ? [log] : [];
      }),
      pumps: remotePumps ?? [],
    };
  }, []);

  const scope = useScope();
  const queryClient = useQueryClient();
  const babyAligned = !queuedBaby || scope.data?.babyId === queuedBaby;
  useEffect(() => {
    if (!queuedBaby || !scope.data || scope.data.babyId === queuedBaby) return;
    focusBaby(queryClient, scope.data, queuedBaby);
  }, [queuedBaby, scope.data, queryClient]);
  const activeScope = babyAligned ? scope.data : null;
  const homeQuery = useQuery({
    queryKey: scopedKey("home", activeScope),
    queryFn: ({ queryKey }) => load(scopeFromKey(queryKey)),
    enabled: Boolean(activeScope?.userId && activeScope.familyId),
  });
  const chillerQuery = useLiveChiller(scope.data?.familyId);
  const view = homeQuery.data ?? null;
  const familyId = view?.familyId ?? null;
  const babies = view?.babies ?? [];
  const baby = view?.baby ?? null;
  const diaperAt = view?.diaperAt ?? null;
  const feedAt = view?.feedAt ?? null;
  const diaperStart = view?.diaperStart ?? null;
  const feedStart = view?.feedStart ?? null;
  const chiller = (chillerQuery.data ? chillerQuery.data.items.filter((item) => !item.clearedAt) : [])
    .map((item) => ({
      id: item.id,
      type: item.type,
      babyId: item.babyId,
      location: item.location,
      storedAt: item.storedAt,
      expiresAt: item.expiresAt,
      volumeMl: item.volumeMl,
      pumpId: item.pumpId,
      note: item.note ?? null,
    }));
  const logs = view?.logs ?? [];
  const pumps = view?.pumps ?? [];
  const status = view ? "ready" : scope.isError || homeQuery.isError || (scope.isSuccess && !scope.data) ? "error" : "loading";

  useEffect(() => {
    const name = baby?.name || t("shell.navHome");
    document.title = `${name} · ${t("shell.brand")}`;
  }, [baby, locale, t]);

  const mergedPumps = mergePumps(pumps, device.pumps);
  const deviceChiller: ChillerRow[] = chillerQuery.data
    ? []
    : device.items.filter((item) => !item.clearedAt).map((item) => ({
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

  const queuedPumpAt = readQueue().reduce<string | null>((latest, item) => {
    if (item.kind !== "log" || item.row.kind !== "pump" || typeof item.row.occurred_at !== "string") return latest;
    if (!latest || item.row.occurred_at > latest) return item.row.occurred_at;
    return latest;
  }, null);
  const lastFamilyPump =
    queuedPumpAt && (!view?.lastFamilyPump || queuedPumpAt > view.lastFamilyPump) ? queuedPumpAt : view?.lastFamilyPump ?? null;
  const pumpTimes =
    now === null
      ? null
      : pumpCardTimes(
          {
            hours: view?.pumpHours ?? [],
            days: view?.pumpDays ?? [],
            timeZone: view?.pumpTimeZone ?? "UTC",
          },
          lastFamilyPump,
          now,
        );
  const cards: {
    key: QuickLogKind;
    icon: CareIconName;
    label: string;
    at: string | null;
    start: string | null;
    href?: string;
  }[] = [
    { key: "diaper", icon: "diaper", label: t("home.diaper"), at: diaperAt, start: diaperStart },
    { key: "feed", icon: "feed", label: t("home.feed"), at: feedAt, start: feedStart },
    {
      key: "pump",
      icon: "pump",
      label: t("home.pump"),
      at: pumpTimes && !pumpTimes.unset ? pumpTimes.at : null,
      start: pumpTimes && !pumpTimes.unset ? pumpTimes.start : null,
      href: pumpTimes?.unset ? "/settings" : undefined,
    },
  ];

  const closeLog = useCallback(() => setLog(null), []);
  const refreshHome = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    await queryClient.invalidateQueries({ queryKey: ["chiller"] });
    await queryClient.invalidateQueries({ queryKey: ["timeline"] });
    await queryClient.invalidateQueries({ queryKey: ["insights"] });
    await queryClient.invalidateQueries({ queryKey: ["family"] });
    await queryClient.invalidateQueries({ queryKey: ["weights"] });
  }, [queryClient]);
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
            onChanged={() => {
              if (!familyId || !scope.data) return;
              const id = chooseBaby(familyId, babies.map((entry) => entry.id));
              if (!id) return;
              focusBaby(queryClient, scope.data, id);
              setQueuedBaby(id);
            }}
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
            const line = card.href
              ? { text: t("home.setSchedule"), overdue: false }
              : countdownLine(card.at, now, t);
            const className = `${SOFT} relative h-full min-h-[7.25rem] w-full min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden px-1.5 pt-7 pb-3 text-center whitespace-normal text-foreground ${
              line.overdue ? "border border-danger" : ""
            }`;
            const body = (
              <>
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
                {card.at && card.start ? (
                  <ExpiryBar
                    storedAt={card.start}
                    expiresAt={card.at}
                    now={now}
                    label={t("home.timeUntilDue")}
                  />
                ) : null}
              </>
            );
            return (
              <li key={card.key} className="min-w-0">
                {card.href ? (
                  <Button asChild variant="ghost" className={className}>
                    <Link href={card.href} aria-label={`${card.label}, ${line.text}`}>
                      {body}
                    </Link>
                  </Button>
                ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLog(card.key)}
                  aria-label={`${card.label}, ${line.text}`}
                  className={className}
                >
                  {body}
                </Button>
                )}
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
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        log: null,
                        chiller: {
                          id: item.id,
                          type: item.type,
                          location: item.location,
                          storedAt: item.storedAt,
                          volumeMl: item.volumeMl,
                          note: item.note,
                        },
                      })
                    }
                    className={`${SOFT} relative flex w-full items-center gap-3 overflow-hidden px-4 py-3 text-left ${expired ? "border border-danger" : ""}`}
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
                  </button>
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLog(item.key)}
                className={`${SOFT} h-auto min-h-[4.75rem] w-full justify-start gap-3 px-4 text-left whitespace-normal text-base text-foreground`}
              >
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <span className="text-base font-semibold">{item.label}</span>
              </Button>
            </li>
          ))}
          <li>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLog("chiller")}
              className={`${SOFT} h-auto min-h-[4.75rem] w-full justify-start gap-3 px-4 text-left whitespace-normal text-base text-foreground`}
            >
              <CareIcon name="chiller" className="h-6 w-6 shrink-0 text-accent" />
              <span className="text-base font-semibold">{t("chiller.title")}</span>
            </Button>
          </li>
          {quick.slice(4).map((item) => (
            <li key={item.key}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLog(item.key)}
                className={`${SOFT} h-auto min-h-[4.75rem] w-full justify-start gap-3 px-4 text-left whitespace-normal text-base text-foreground`}
              >
                <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                <span className="text-base font-semibold">{item.label}</span>
              </Button>
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
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className={`${SOFT} flex w-full items-center gap-3 px-4 py-3 text-left`}
                >
                  <CareIcon name={item.icon} className="h-6 w-6 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    {item.detail ? <p className="truncate text-sm text-muted">{item.detail}</p> : null}
                  </div>
                  <p className="max-w-[7.5rem] shrink-0 text-right text-xs leading-4 text-muted">
                    {activityWhen(item.at, locale, t)}
                  </p>
                </button>
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
        activePartPumpIds={chillerItems.flatMap((item) =>
          item.type === "pump_parts" && item.pumpId ? [item.pumpId] : [],
        )}
        onClose={closeLog}
        onSaved={refreshHome}
      />
      <EditEntryDialog
        log={editing?.log ?? null}
        chiller={editing?.chiller ?? null}
        familyId={familyId}
        washByHours={24}
        onClose={() => setEditing(null)}
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
  const rows: {
    id: string;
    at: string;
    icon: CareIconName;
    title: string;
    detail: string;
    log: LogEdit | null;
    chiller: ChillerEdit | null;
  }[] = [
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
        log: {
          id: log.id,
          kind: log.kind,
          occurredAt: log.occurredAt,
          amountMl: log.amountMl,
          durationSeconds: log.durationSeconds,
        },
        chiller: null,
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
      log: null,
      chiller: {
        id: item.id,
        type: item.type,
        location: item.location,
        storedAt: item.storedAt,
        volumeMl: item.volumeMl,
        note: item.note,
      },
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
