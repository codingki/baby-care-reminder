"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CareIcon } from "@/components/care-icon";
import { Screen } from "@/components/screen";
import { Card } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Bar, BarChart, Line, LineChart, XAxis } from "recharts";
import { useI18n } from "@/i18n/provider";
import { scopeFromKey, scopedKey, useScope } from "@/lib/care-queries";
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
  const scope = useScope();
  const insightsQuery = useQuery({
    queryKey: scopedKey("insights", scope.data, range),
    enabled: Boolean(scope.data?.userId && scope.data.familyId),
    queryFn: async ({ queryKey }) => {
      const selected = scopeFromKey(queryKey);
      const selectedRange: Range = queryKey[4] === 30 ? 30 : 7;
      if (!selected.babyId) {
        return {
          userId: selected.userId,
          familyId: selected.familyId,
          babyId: null,
          days: buildDays(selectedRange, []),
          weights: [] as WeightPoint[],
          summary: { feeds: 0, ml: 0, diapers: 0, gap: "" },
        };
      }
      const start = startOfRange(selectedRange);
      const today = startOfDay(new Date());
      const supabase = createClient();
      const [logs, weightLogs] = await Promise.all([
        supabase
          .from("logs")
          .select("kind, occurred_at, amount_ml, diaper_kind, feed_kind, duration_seconds")
          .eq("family_id", selected.familyId)
          .eq("baby_id", selected.babyId)
          .is("deleted_at", null)
          .gte("occurred_at", start.toISOString())
          .order("occurred_at"),
        supabase
          .from("weight_logs")
          .select("weighed_on, weight_grams")
          .eq("baby_id", selected.babyId)
          .is("deleted_at", null)
          .gte("weighed_on", dayKey(start))
          .order("weighed_on"),
      ]);
      if (logs.error || weightLogs.error) {
        throw logs.error ?? weightLogs.error;
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
      return {
        userId: selected.userId,
        familyId: selected.familyId,
        babyId: selected.babyId,
        days: buildDays(selectedRange, parsed),
        weights: (weightLogs.data ?? []).flatMap((row) => {
          if (typeof row.weighed_on !== "string" || typeof row.weight_grams !== "number") return [];
          return [{ at: row.weighed_on, grams: row.weight_grams }];
        }),
        summary: todaySummary(parsed, today),
      };
    },
  });
  const days = insightsQuery.data?.days ?? [];
  const weights = insightsQuery.data?.weights ?? [];
  const summary = insightsQuery.data?.summary ?? { feeds: 0, ml: 0, diapers: 0, gap: "" };
  const state = insightsQuery.data ? "ready" : insightsQuery.isPending ? "loading" : "error";

  return (
    <Screen
      titleKey="insights.title"
      ledeKey="insights.lede"
      showLater={false}
      icon={<CareIcon name="insights" className="h-8 w-8" />}
    >
      <ToggleGroup
        type="single"
        value={String(range)}
        spacing={2}
        className="grid w-full grid-cols-2 gap-2"
        aria-label={t("insights.title")}
        onValueChange={(next) => {
          if (next !== "7" && next !== "30") return;
          setRange(next === "7" ? 7 : 30);
        }}
      >
        <ToggleGroupItem value="7" size="lg" className="w-full">
          {t("insights.days7")}
        </ToggleGroupItem>
        <ToggleGroupItem value="30" size="lg" className="w-full">
          {t("insights.days30")}
        </ToggleGroupItem>
      </ToggleGroup>
      {state === "loading" ? (
        <div className="flex flex-col gap-3" role="status" aria-label={t("insights.loading")}>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
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
            <p className="text-xs font-semibold text-muted">{t("insights.bottleMl")}</p>
            <Bars days={days} pick={(day) => [day.bottleMl]} colors={[SAGE]} empty={t("insights.empty")} />
            <p className="mt-2 text-xs font-semibold text-muted">{t("insights.dbfMinutes")}</p>
            <Bars days={days} pick={(day) => [day.dbfMinutes]} colors={[SAGE_DEEP]} empty={t("insights.empty")} />
          </ChartCard>
          <ChartCard title={t("insights.diapers")}>
            <p className="text-xs font-semibold text-muted">{t("insights.events")}</p>
            <Bars
              days={days}
              pick={(day) => [day.wet + day.both, day.dirty + day.both]}
              colors={[SAGE_SOFT, SAGE]}
              empty={t("insights.empty")}
              legend={[t("diaper.wet"), t("diaper.dirty")]}
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
    <Card className="gap-2 px-4 py-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Bars({
  days,
  pick,
  colors,
  empty,
  legend,
}: {
  days: Day[];
  pick: (day: Day) => number[];
  colors: string[];
  empty: string;
  legend?: string[];
}) {
  const series = days.map((day) => pick(day));
  const blank = series.every((values) => values.every((value) => value === 0));
  if (blank) return <p className="text-sm text-muted">{empty}</p>;
  const data = days.map((day, index) => {
    const values = pick(day);
    const row: Record<string, string | number> = {
      label: showLabel(index, days.length) ? day.label : "",
    };
    values.forEach((value, seriesIndex) => {
      row[`s${seriesIndex}`] = value;
    });
    return row;
  });
  const config = Object.fromEntries(
    colors.map((color, index) => [`s${index}`, { label: legend?.[index] ?? "", color }]),
  );
  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-36 w-full">
        <BarChart data={data}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8b938e", fontSize: 10 }} />
          {colors.map((color, index) => (
            <Bar key={color} dataKey={`s${index}`} stackId="stack" fill={color} radius={2} />
          ))}
        </BarChart>
      </ChartContainer>
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
  const data = points.map((point) => ({
    label: point.at.slice(5),
    kg: Math.round((point.grams / 1000) * 100) / 100,
  }));
  return (
    <ChartContainer config={{ kg: { label: "kg", color: SAGE } }} className="aspect-auto h-36 w-full">
      <LineChart data={data}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8b938e", fontSize: 10 }} />
        <Line type="monotone" dataKey="kg" stroke={SAGE} strokeWidth={2} dot={{ r: 3.5, fill: SAGE }} />
      </LineChart>
    </ChartContainer>
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
