"use client";

import { useEffect, useState } from "react";
import { CareIcon, type CareIconName } from "@/components/care-icon";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { loadFamilyContext } from "@/lib/family-context";
import { loadMemberNames } from "@/lib/member-names";
import { readQueue } from "@/lib/offline-queue";
import { createClient } from "@/lib/supabase/client";

type TimelineLog = {
  id: string;
  kind: string;
  occurredAt: string;
  amountMl: number | null;
  diaperKind: string | null;
  by: string | null;
};

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function clock(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TimelinePage() {
  const { locale, t } = useI18n();
  const [logs, setLogs] = useState<TimelineLog[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      const since = startOfDay().toISOString();
      const queued = readQueue()
        .filter((item) => item.kind === "log")
        .map((item) => toLog(item.id, item.row, null))
        .filter((log): log is TimelineLog => log !== null && log.occurredAt >= since);

      if (!context) {
        setLogs(queued);
        setState(queued.length > 0 ? "ready" : "error");
        return;
      }

      const supabase = createClient();
      const [{ data, error }, names] = await Promise.all([
        supabase
          .from("logs")
          .select("id, kind, occurred_at, amount_ml, diaper_kind, logged_by")
          .eq("family_id", context.familyId)
          .gte("occurred_at", since)
          .order("occurred_at", { ascending: false }),
        loadMemberNames(context.familyId),
      ]);

      if (error) {
        setLogs(queued);
        setState(queued.length > 0 ? "ready" : "error");
        return;
      }

      const remote = (data ?? [])
        .map((row) =>
          toLog(
            String(row.id),
            {
              kind: row.kind,
              occurred_at: row.occurred_at,
              amount_ml: row.amount_ml,
              diaper_kind: row.diaper_kind,
              logged_by: row.logged_by,
            },
            names,
          ),
        )
        .filter((log): log is TimelineLog => log !== null);
      const seen = new Set(remote.map((log) => log.id));
      setLogs([...queued.filter((log) => !seen.has(log.id)), ...remote]);
      setState("ready");
    })();
  }, []);

  const feedMl = logs.filter((log) => log.kind === "feed").reduce((sum, log) => sum + (log.amountMl ?? 0), 0);
  const pumpMl = logs.filter((log) => log.kind === "pump").reduce((sum, log) => sum + (log.amountMl ?? 0), 0);
  const wet = logs.filter((log) => log.diaperKind === "wet").length;
  const dirty = logs.filter((log) => log.diaperKind === "dirty").length;
  const both = logs.filter((log) => log.diaperKind === "mixed").length;

  return (
    <Screen
      titleKey="timeline.title"
      ledeKey="timeline.lede"
      backHref="/"
      showLater={false}
      icon={<CareIcon name="schedule" className="h-8 w-8" />}
    >
      {state === "loading" ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("timeline.loading")}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="text-sm text-muted" role="alert">
          {t("timeline.error")}
        </p>
      ) : null}
      {state === "ready" && logs.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">{t("timeline.empty")}</p>
      ) : null}
      {logs.length > 0 ? (
        <>
          <ul className="grid grid-cols-1 gap-3">
            <li className="rounded-3xl border border-line bg-card px-5 py-4">
              <p className="text-sm text-muted">{t("timeline.feeds")}</p>
              <p className="text-base font-semibold">{t("timeline.ml", { amount: String(feedMl) })}</p>
            </li>
            <li className="rounded-3xl border border-line bg-card px-5 py-4">
              <p className="text-sm text-muted">{t("timeline.pumps")}</p>
              <p className="text-base font-semibold">{t("timeline.ml", { amount: String(pumpMl) })}</p>
            </li>
            <li className="rounded-3xl border border-line bg-card px-5 py-4">
              <p className="text-sm text-muted">{t("timeline.diapers")}</p>
              <p className="text-base font-semibold">
                {t("timeline.diaperMix", { wet: String(wet), dirty: String(dirty), both: String(both) })}
              </p>
            </li>
          </ul>
          <ol className="flex flex-col gap-3">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center gap-2 text-sm">
                <CareIcon name={logIcon(log.kind)} className="h-4 w-4 shrink-0 text-accent" />
                <span className="font-semibold">{label(log, t)}</span>
                {log.amountMl ? <span> · {log.amountMl} ml</span> : null}
                {log.by ? <span> · {log.by}</span> : null}
                <span className="text-muted"> · {clock(log.occurredAt, locale)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </Screen>
  );
}

function toLog(
  id: string,
  row: Record<string, unknown>,
  names: Record<string, string> | null,
): TimelineLog | null {
  const kind = row.kind;
  const occurredAt = row.occurred_at;
  if (typeof kind !== "string" || typeof occurredAt !== "string") return null;
  const loggedBy = typeof row.logged_by === "string" ? row.logged_by : null;
  return {
    id,
    kind,
    occurredAt,
    amountMl: typeof row.amount_ml === "number" ? row.amount_ml : null,
    diaperKind: typeof row.diaper_kind === "string" ? row.diaper_kind : null,
    by: loggedBy && names ? names[loggedBy] ?? null : null,
  };
}

function logIcon(kind: string): CareIconName {
  if (kind === "feed") return "feed";
  if (kind === "pump") return "pump";
  return "diaper";
}

function label(
  log: TimelineLog,
  t: (key: "diaper.title" | "diaper.wet" | "diaper.dirty" | "diaper.both" | "feed.title" | "pump.title") => string,
) {
  if (log.kind === "feed") return t("feed.title");
  if (log.kind === "pump") return t("pump.title");
  if (log.diaperKind === "wet") return `${t("diaper.title")} · ${t("diaper.wet")}`;
  if (log.diaperKind === "dirty") return `${t("diaper.title")} · ${t("diaper.dirty")}`;
  if (log.diaperKind === "mixed") return `${t("diaper.title")} · ${t("diaper.both")}`;
  return t("diaper.title");
}
