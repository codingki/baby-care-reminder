"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { ClearChiller } from "@/components/clear-chiller";
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
  const [reload, setReload] = useState(0);

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
  }, [device.items.length, reload]);

  const deviceItems: LiveChillerItem[] = device.items
    .filter((item) => !item.clearedAt)
    .map((item) => ({
      ...item,
      pumpName: deviceName(item, device.pumps),
      clearedAt: null,
      clearedReason: null,
    }));
  const items = mergeItems(live, deviceItems);
  const active = items.filter((item) => !item.clearedAt);
  const cleared = items.filter((item) => item.clearedAt);

  return (
    <Screen
      titleKey="chiller.title"
      ledeKey="chiller.lede"
      showLater={false}
      icon={<CareIcon name="chiller" className="h-8 w-8" />}
    >
      {state === "loading" && active.length === 0 ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("chiller.loading")}
        </p>
      ) : null}
      {state === "error" && active.length === 0 ? (
        <p className="text-sm text-muted" role="alert">
          {t("chiller.error")}
        </p>
      ) : null}
      {state !== "loading" && active.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">{t("chiller.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((item) => {
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
              <li key={item.id} className="rounded-3xl border border-line bg-card px-5 py-4">
                <Link
                  href={`/chiller/${item.id}`}
                  className="flex items-start gap-3"
                >
                  <CareIcon
                    name={item.type === "milk" ? "feed" : "chiller"}
                    className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                  />
                  <span>
                    <p className="text-base font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-muted">{t(`chiller.${item.location}`)}</p>
                    {item.type === "milk" && item.note ? <p className="mt-1 text-sm">{item.note}</p> : null}
                    <p className={`mt-1 text-sm ${expired ? "font-semibold text-accent" : ""}`}>{when}</p>
                  </span>
                </Link>
                <div className="mt-3">
                  <ClearChiller id={item.id} type={item.type} onCleared={() => setReload((value) => value + 1)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {cleared.length > 0 ? (
        <details className="rounded-3xl border border-line bg-card px-5 py-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {t("chiller.cleared")} · {cleared.length}
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {cleared.map((item) => {
              const title =
                item.type === "milk"
                  ? `${t("chiller.milk")}${item.volumeMl ? ` · ${item.volumeMl} ml` : ""}`
                  : item.pumpName || t("chiller.parts");
              return (
                <li key={item.id} className="text-sm">
                  <Link href={`/chiller/${item.id}`} className="font-semibold">
                    {title}
                  </Link>
                  {item.clearedReason ? (
                    <span className="text-muted"> · {t(`chiller.${item.clearedReason}`)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
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
