"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { pumpLabel } from "@/lib/device-care";
import type { ChillerItem, OwnedPump } from "@/lib/device-care";
import { formatSpan, nowMs } from "@/lib/relative-time";

function byExpiry(left: ChillerItem, right: ChillerItem) {
  return left.expiresAt < right.expiresAt ? -1 : left.expiresAt > right.expiresAt ? 1 : 0;
}

function itemName(item: ChillerItem, pumps: OwnedPump[]) {
  const pump = pumps.find((entry) => entry.id === item.pumpId);
  if (!pump) return "";
  return pump.nickname ?? pump.model ?? pump.customName ?? pumpLabel(pump);
}

function clockTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HomeReminders() {
  const { locale, t } = useI18n();
  const { items, pumps } = useCareStore();
  const [now, setNow] = useState(nowMs);
  const [clockIds, setClockIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const upcoming = [...items].sort(byExpiry);
  if (upcoming.length === 0) return null;

  function toggleClock(id: string) {
    setClockIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted">{t("home.nextUp")}</h2>
      <ul className="flex flex-col gap-2">
        {upcoming.map((item) => {
          const remaining = new Date(item.expiresAt).getTime() - now;
          const overdue = remaining < 0;
          const span = formatSpan(remaining);
          const relative = overdue
            ? t("home.overdue", { time: span })
            : t("home.inRelative", { time: span });
          const label = item.type === "milk" ? t("chiller.milk") : itemName(item, pumps);
          const showingClock = clockIds.has(item.id);

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggleClock(item.id)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 text-left text-sm"
              >
                <span className="font-semibold">{label}</span>
                <span className={overdue ? "font-semibold text-accent" : "text-muted"}>
                  {showingClock ? clockTime(item.expiresAt, locale) : relative}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeChiller() {
  const { t } = useI18n();
  const { items, pumps } = useCareStore();
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = [...items].sort(byExpiry).slice(0, 3);
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
        {rows.map((item) => {
          const remaining = new Date(item.expiresAt).getTime() - now;
          const expired = remaining < 0;
          const when = expired
            ? t("home.expired")
            : t("home.timeLeft", { time: formatSpan(remaining) });
          const name = item.type === "milk" ? `${item.volumeMl ?? 0} ml` : itemName(item, pumps);

          return (
            <li key={item.id}>
              <Link
                href={`/chiller/${item.id}`}
                className="flex min-h-12 items-center rounded-2xl border border-line bg-card px-4 text-sm"
              >
                <span className="font-semibold">{name}</span>
                <span className="text-muted"> · </span>
                <span className={expired ? "font-semibold text-accent" : undefined}>{when}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
