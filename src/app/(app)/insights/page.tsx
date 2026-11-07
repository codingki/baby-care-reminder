"use client";

import { useEffect, useState } from "react";
import { CareIcon } from "@/components/care-icon";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { formatSpan } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/client";

type Range = 7 | 30;

type LogRow = {
  kind: string;
  at: string;
  amountMl: number | null;
  diaperKind: string | null;
  feedKind: string | null;
  durationSeconds: number | null;
};

type WeightPoint = { at: string; grams: number };

type Day = {
  key: string;
  label: string;
  feeds: number;
  bottleMl: number;
  dbfMinutes: number;
  wet: number;
  dirty: number;
  both: number;
  pumpMl: number;
};

const SAGE = "#5f7f6c";
const SAGE_SOFT = "#b7c9be";
const SAGE_DEEP = "#3e5648";

export default function InsightsPage() {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>(7);
  const [days, setDays] = useState<Day[]>([]);
  const [weights, setWeights] = useState<WeightPoint[]>([]);
  const [summary, setSummary] = useState({ feeds: 0, ml: 0, diapers: 0, gap: "" });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let ignore = false;
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) {
        if (!ignore) setState("error");
        return;
      }
      const start = startOfRange(range);
      const today = startOfDay(new Date());
      const supabase = createClient();
      const [logs, weightLogs] = await Promise.all([
        supabase
          .from("logs")
          .select("kind, occurred_at, amount_ml, diaper_kind, feed_kind, duration_seconds")
          .eq("family_id", context.familyId)
          .gte("occurred_at", start.toISOString())
          .order("occurred_at"),
        supabase
          .from("weight_logs")
          .select("weighed_on, weight_grams")
          .eq("baby_id", context.babyId ?? "")
          .gte("weighed_on", dayKey(start))
          .order("weighed_on"),
      ]);
      if (ignore) return;
      if (logs.error || weightLogs.error || !context.babyId) {
        setState(logs.error || weightLogs.error ? "error" : "ready");
        setDays(buildDays(range, []));
        setWeights([]);
        setSummary({ feeds: 0, ml: 0, diapers: 0, gap: "" });
        return;
      }
      const parsed = (logs.data ?? []).flatMap((row) => {
        if (typeof row.kind !== "string" || typeof row.occurred_at !== "string") return [];
        return [
          {
            kind: row.kind,
            at: row.occurred_at,
            amountMl: typeof row.amount_ml === "number" ? row.amount_ml : null,
            diaperKind: typeof row.diaper_kind === "string" ? row.diaper_kind : null,
            feedKind: typeof row.feed_kind === "string" ? row.feed_kind : null,
            durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
          } satisfies LogRow,
        ];
      });
      setDays(buildDays(range, parsed));
      setWeights(
        (weightLogs.data ?? []).flatMap((row) => {
          if (typeof row.weighed_on !== "string" || typeof row.weight_grams !== "number") return [];
          return [{ at: row.weighed_on, grams: row.weight_grams }];
        }),
      );
      setSummary(todaySummary(parsed, today));
      setState("ready");
    })();
    return () => {
      ignore = true;
    };
  }, [range]);

  return (
    <Screen
      titleKey="insights.title"
      ledeKey="insights.lede"
      showLater={false}
      icon={<CareIcon name="insights" className="h-8 w-8" />}
    >
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("insights.title")}>
        {([7, 30] as const).map((option) => {
          const pressed = range === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                setState("loading");
                setRange(option);
              }}
              className={`min-h-12 rounded-2xl text-sm font-semibold ${
                pressed ? "bg-accent text-accent-foreground" : "border border-line bg-card"
              }`}
            >
              {t(option === 7 ? "insights.days7" : "insights.days30")}
            </button>
          );
        })}
      </div>
      {state === "loading" ? (
        <p className="text-sm text-muted" role="status">
          {t("insights.loading")}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="text-sm text-muted" role="alert">
          {t("insights.error")}
        </p>
      ) : null}
      {state === "ready" ? (
        <>
          <section className="grid grid-cols-4 gap-2">
            <Summary label={t("insights.todayFeeds")} value={String(summary.feeds)} />
            <Summary label={t("insights.todayMl")} value={String(summary.ml)} />
            <Summary label={t("insights.todayDiapers")} value={String(summary.diapers)} />
            <Summary label={t("insights.feedGap")} value={summary.gap || t("insights.gapEmpty")} />
          </section>
          <ChartCard title={t("insights.feeds")}>
            <FeedChart
              days={days}
              empty={t("insights.empty")}
              mlLabel={t("insights.bottleMl")}
              minutesLabel={t("insights.dbfMinutes")}
              countLabel={t("insights.feedCount")}
            />
          </ChartCard>
          <ChartCard title={t("insights.diapers")}>
            <Bars
              days={days}
              pick={(day) => [day.wet + day.both, day.dirty + day.both]}
              colors={[SAGE_SOFT, SAGE]}
              empty={t("insights.empty")}
              legend={[t("diaper.wet"), t("diaper.dirty")]}
              showTotal={false}
            />
          </ChartCard>
          <ChartCard title={t("insights.pumpMl")}>
            <Bars days={days} pick={(day) => [day.pumpMl]} colors={[SAGE]} empty={t("insights.empty")} />
          </ChartCard>
          <ChartCard title={t("insights.weight")}>
            <WeightLine points={weights} empty={t("insights.empty")} />
          </ChartCard>
        </>
      ) : null}
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f3f5f3] px-2 py-3 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-3xl border border-line bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function FeedChart({
  days,
  empty,
  mlLabel,
  minutesLabel,
  countLabel,
}: {
  days: Day[];
  empty: string;
  mlLabel: string;
  minutesLabel: string;
  countLabel: string;
}) {
  const blank = days.every((day) => day.feeds === 0 && day.bottleMl === 0 && day.dbfMinutes === 0);
  if (blank) return <p className="text-sm text-muted">{empty}</p>;
  const width = 320;
  const plotTop = 16;
  const plotHeight = 96;
  const height = plotTop + plotHeight;
  const maxMl = Math.max(1, ...days.map((day) => day.bottleMl));
  const maxMinutes = Math.max(1, ...days.map((day) => day.dbfMinutes));
  const slot = width / days.length;
  const line = days.map((day, index) => {
    const x = index * slot + slot / 2;
    const y = plotTop + plotHeight - (day.dbfMinutes / maxMinutes) * (plotHeight - 4);
    return { x, y };
  });
  const path = line.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full" role="img">
        {days.map((day, index) => {
          const bar = slot * 0.5;
          const x = index * slot + (slot - bar) / 2;
          const h = (day.bottleMl / maxMl) * (plotHeight - 4);
          return (
            <g key={day.key}>
              <rect x={x} y={plotTop + plotHeight - h} width={bar} height={h} rx={2} fill={SAGE} />
              {day.feeds > 0 ? (
                <text x={index * slot + slot / 2} y={11} textAnchor="middle" fontSize="8" fill="#3d4441">
                  {day.feeds}
                </text>
              ) : null}
              {showLabel(index, days.length) ? (
                <text x={index * slot + slot / 2} y={height + 12} textAnchor="middle" fontSize="8" fill="#8b938e">
                  {day.label}
                </text>
              ) : null}
            </g>
          );
        })}
        <path d={path} fill="none" stroke={SAGE_DEEP} strokeWidth="2" />
        {line.map((point, index) =>
          days[index] && days[index].dbfMinutes > 0 ? (
            <circle key={days[index].key} cx={point.x} cy={point.y} r="2.5" fill={SAGE_DEEP} />
          ) : null,
        )}
      </svg>
      <ul className="flex flex-wrap gap-3 text-xs text-muted">
        <li className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SAGE }} />
          {mlLabel}
        </li>
        <li className="flex items-center gap-1">
          <span className="h-0.5 w-3" style={{ backgroundColor: SAGE_DEEP }} />
          {minutesLabel}
        </li>
        <li>{countLabel}</li>
      </ul>
    </div>
  );
}

function Bars({
  days,
  pick,
  colors,
  empty,
  legend,
  showTotal = true,
}: {
  days: Day[];
  pick: (day: Day) => number[];
  colors: string[];
  empty: string;
  legend?: string[];
  showTotal?: boolean;
}) {
  const series = days.map((day) => pick(day));
  const max = Math.max(1, ...series.map((values) => values.reduce((sum, value) => sum + value, 0)));
  const blank = series.every((values) => values.every((value) => value === 0));
  if (blank) return <p className="text-sm text-muted">{empty}</p>;
  const width = 320;
  const height = 120;
  const slot = width / days.length;
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full" role="img">
        {series.map((values, index) => {
          const total = values.reduce((sum, value) => sum + value, 0);
          let y = height;
          const x = index * slot + slot * 0.18;
          const bar = slot * 0.64;
          return (
            <g key={days[index]?.key ?? index}>
              {values.map((value, seriesIndex) => {
                const h = (value / max) * (height - 8);
                y -= h;
                return <rect key={seriesIndex} x={x} y={y} width={bar} height={h} rx={2} fill={colors[seriesIndex]} />;
              })}
              {showLabel(index, days.length) ? (
                <text x={index * slot + slot / 2} y={height + 12} textAnchor="middle" fontSize="8" fill="#8b938e">
                  {days[index]?.label}
                </text>
              ) : null}
              {showTotal && total > 0 && days.length <= 7 ? (
                <text x={index * slot + slot / 2} y={y - 2} textAnchor="middle" fontSize="8" fill="#3d4441">
                  {Math.round(total)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {legend ? (
        <ul className="flex flex-wrap gap-3 text-xs text-muted">
          {legend.map((label, index) => (
            <li key={label} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors[index] }} />
              {label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WeightLine({ points, empty }: { points: WeightPoint[]; empty: string }) {
  if (points.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const width = 320;
  const height = 120;
  const values = points.map((point) => point.grams / 1000);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 16) + 8;
    const y = height - 16 - ((value - min) / span) * (height - 28);
    return { x, y, value };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      <path d={path} fill="none" stroke={SAGE} strokeWidth="2" />
      {coords.map((point) => (
        <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3.5" fill={SAGE} />
      ))}
    </svg>
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfRange(range: Range) {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - (range - 1));
  return start;
}

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function buildDays(range: Range, logs: LogRow[]) {
  const start = startOfRange(range);
  const days: Day[] = [];
  for (let index = 0; index < range; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.push({
      key: dayKey(date),
      label: range === 7 ? date.toLocaleDateString(undefined, { weekday: "narrow" }) : String(date.getDate()),
      feeds: 0,
      bottleMl: 0,
      dbfMinutes: 0,
      wet: 0,
      dirty: 0,
      both: 0,
      pumpMl: 0,
    });
  }
  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const log of logs) {
    const day = byKey.get(dayKey(new Date(log.at)));
    if (!day) continue;
    if (log.kind === "feed") {
      day.feeds += 1;
      if (log.feedKind === "breast") day.dbfMinutes += Math.round((log.durationSeconds ?? 0) / 60);
      else day.bottleMl += log.amountMl ?? 0;
    } else if (log.kind === "diaper") {
      if (log.diaperKind === "wet") day.wet += 1;
      else if (log.diaperKind === "dirty") day.dirty += 1;
      else if (log.diaperKind === "mixed") day.both += 1;
    } else if (log.kind === "pump") {
      day.pumpMl += log.amountMl ?? 0;
    }
  }
  return days;
}

function todaySummary(logs: LogRow[], today: Date) {
  const key = dayKey(today);
  const todayLogs = logs.filter((log) => dayKey(new Date(log.at)) === key);
  const feeds = todayLogs.filter((log) => log.kind === "feed").sort((left, right) => (left.at < right.at ? -1 : 1));
  const gaps: number[] = [];
  for (let index = 1; index < feeds.length; index += 1) {
    gaps.push(new Date(feeds[index].at).getTime() - new Date(feeds[index - 1].at).getTime());
  }
  const gap = gaps.length ? formatSpan(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : "";
  return {
    feeds: feeds.length,
    ml: todayLogs.reduce((sum, log) => sum + (log.kind === "feed" && log.feedKind !== "breast" ? log.amountMl ?? 0 : 0), 0),
    diapers: todayLogs.filter((log) => log.kind === "diaper").length,
    gap,
  };
}

function showLabel(index: number, count: number) {
  if (count <= 7) return true;
  return index % 5 === 0 || index === count - 1;
}
