"use client";

import { PartsDisclaimer } from "@/components/parts-disclaimer";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { pumpLabel } from "@/lib/device-care";

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
  const item = care.items.find((entry) => entry.id === id) ?? null;
  const pump = care.pumps.find((entry) => entry.id === item?.pumpId) ?? null;

  if (!item) {
    return (
      <Screen titleKey="chiller.detailTitle" ledeKey="chiller.missing" backHref="/chiller" showLater={false} />
    );
  }

  const when = formatWhen(item.expiresAt, locale);

  return (
    <Screen titleKey="chiller.detailTitle" ledeKey="chiller.detailLede" backHref="/chiller" showLater={false}>
      <div className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">
          {item.type === "milk" ? t("chiller.milk") : pump ? pumpLabel(pump) : t("chiller.parts")}
        </h2>
        <p className="text-sm text-muted">{t(`chiller.${item.location}`)}</p>
        {item.volumeMl !== null ? (
          <p className="text-sm">{t("chiller.volume", { amount: String(item.volumeMl) })}</p>
        ) : null}
        {item.type === "pump_parts" ? (
          <PartsDisclaimer time={when} seen={care.partsDisclaimerSeen} />
        ) : (
          <p className="text-sm font-semibold">{t("chiller.useBy", { time: when })}</p>
        )}
      </div>
    </Screen>
  );
}
