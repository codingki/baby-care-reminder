"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { loadLiveChiller, type LiveChillerItem } from "@/lib/chiller-live";
import { pumpLabel, type ChillerItem, type OwnedPump } from "@/lib/device-care";
import { formatSpan, nowMs } from "@/lib/relative-time";

export default function ChillerPage() {
  const { t } = useI18n();
  const device = useCareStore();
  const [now, setNow] = useState(nowMs);
  const [live, setLive] = useState<LiveChillerItem[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadLiveChiller().then((items) => {
      if (!items) {
        setState(device.items.length > 0 ? "ready" : "error");
        return;
      }
      setLive(items);
      setState("ready");
    });
  }, [device.items.length]);

  const deviceItems: LiveChillerItem[] = device.items.map((item) => ({
    ...item,
    pumpName: deviceName(item, device.pumps),
  }));
  const items = mergeItems(live, deviceItems);

  return (
    <Screen titleKey="chiller.title" ledeKey="chiller.lede" showLater={false}>
      {state === "loading" && items.length === 0 ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("chiller.loading")}
        </p>
      ) : null}
      {state === "error" && items.length === 0 ? (
        <p className="text-sm text-muted" role="alert">
          {t("chiller.error")}
        </p>
      ) : null}
      {state !== "loading" && items.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">{t("chiller.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const remaining = new Date(item.expiresAt).getTime() - now;
            const expired = remaining < 0;
            const title =
              item.type === "milk"
                ? `${t("chiller.milk")}${item.volumeMl ? ` · ${item.volumeMl} ml` : ""}`
                : item.pumpName || t("chiller.parts");
            const when = expired
              ? t("home.expired")
              : t("home.timeLeft", { time: formatSpan(remaining) });
            return (
              <li key={item.id}>
                <Link
                  href={`/chiller/${item.id}`}
                  className="block rounded-3xl border border-line bg-card px-5 py-4"
                >
                  <p className="text-base font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted">{t(`chiller.${item.location}`)}</p>
                  <p className={`mt-1 text-sm ${expired ? "font-semibold text-accent" : ""}`}>{when}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}

function deviceName(item: ChillerItem, pumps: OwnedPump[]) {
  const pump = pumps.find((entry) => entry.id === item.pumpId);
  return pump ? pumpLabel(pump) : null;
}

function mergeItems(live: LiveChillerItem[] | null, device: LiveChillerItem[]) {
  const byId = new Map<string, LiveChillerItem>();
  for (const item of live ?? []) byId.set(item.id, item);
  for (const item of device) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => (left.expiresAt < right.expiresAt ? -1 : 1));
}
