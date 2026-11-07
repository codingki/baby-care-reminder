"use client";

import { useEffect, useState } from "react";
import { CareIcon } from "@/components/care-icon";
import { PartsDisclaimer } from "@/components/parts-disclaimer";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { loadLiveChiller, type LiveChillerItem } from "@/lib/chiller-live";
import { pumpLabel } from "@/lib/device-care";
import { formatSpan, nowMs } from "@/lib/relative-time";

function formatWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChillerDetail({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const care = useCareStore();
  const [now, setNow] = useState(nowMs);
  const [item, setItem] = useState<LiveChillerItem | null>(null);
  const [state, setState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadLiveChiller().then((items) => {
      const found = items?.find((entry) => entry.id === id) ?? null;
      if (found) {
        setItem(found);
        setState("ready");
        return;
      }
      const local = care.items.find((entry) => entry.id === id) ?? null;
      const pump = care.pumps.find((entry) => entry.id === local?.pumpId) ?? null;
      setItem(
        local
          ? { ...local, pumpName: pump ? pumpLabel(pump) : null }
          : null,
      );
      setState("ready");
    });
  }, [care.items, care.pumps, id]);

  if (state === "loading") {
    return (
      <Screen
        titleKey="chiller.detailTitle"
        ledeKey="chiller.detailLede"
        backHref="/chiller"
        showLater={false}
        icon={<CareIcon name="chiller" className="h-8 w-8" />}
      >
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("chiller.loading")}
        </p>
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen
        titleKey="chiller.detailTitle"
        ledeKey="chiller.missing"
        backHref="/chiller"
        showLater={false}
        icon={<CareIcon name="chiller" className="h-8 w-8" />}
      />
    );
  }

  const remaining = new Date(item.expiresAt).getTime() - now;
  const expired = remaining < 0;
  const relative = expired ? t("home.expired") : t("home.timeLeft", { time: formatSpan(remaining) });
  const when = formatWhen(item.expiresAt, locale);
  const title = item.type === "milk" ? t("chiller.milk") : item.pumpName || t("chiller.parts");

  return (
    <Screen
      titleKey="chiller.detailTitle"
      ledeKey="chiller.detailLede"
      backHref="/chiller"
      showLater={false}
      icon={<CareIcon name="chiller" className="h-8 w-8" />}
    >
      <div className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CareIcon name={item.type === "milk" ? "feed" : "pump"} className="h-5 w-5 text-accent" />
          {title}
        </h2>
        <p className="text-sm text-muted">{t(`chiller.${item.location}`)}</p>
        {item.volumeMl !== null ? (
          <p className="text-sm">{t("chiller.volume", { amount: String(item.volumeMl) })}</p>
        ) : null}
        {item.type === "milk" && item.note ? (
          <p className="text-sm">
            <span className="font-semibold">{t("chiller.note")}</span>
            <span className="text-muted"> · </span>
            {item.note}
          </p>
        ) : null}
        <p className={`text-sm font-semibold ${expired ? "text-accent" : ""}`}>{relative}</p>
        {item.type === "pump_parts" ? (
          <PartsDisclaimer time={when} seen={care.partsDisclaimerSeen} />
        ) : (
          <p className="text-sm">{t("chiller.useBy", { time: when })}</p>
        )}
      </div>
    </Screen>
  );
}
