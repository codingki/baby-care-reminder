"use client";

import Link from "next/link";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { pumpLabel, type ChillerItem, type OwnedPump } from "@/lib/device-care";

function formatWhen(iso: string, locale: Locale) {
  return new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChillerPage() {
  const { locale, t } = useI18n();
  const { items, pumps } = useCareStore();

  return (
    <Screen titleKey="chiller.title" ledeKey="chiller.lede" showLater={false}>
      {items.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">
          {t("chiller.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/chiller/${item.id}`} className="block rounded-3xl border border-line bg-card px-5 py-4">
                <ItemSummary item={item} locale={locale} name={labelFor(item, pumps)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm leading-6 text-muted">{t("chiller.deviceNote")}</p>
    </Screen>
  );
}

function labelFor(item: ChillerItem, pumps: OwnedPump[]) {
  const pump = pumps.find((entry) => entry.id === item.pumpId);
  return pump ? pumpLabel(pump) : null;
}

function ItemSummary({
  item,
  locale,
  name,
}: {
  item: ChillerItem;
  locale: Locale;
  name: string | null;
}) {
  const { t } = useI18n();
  const when = formatWhen(item.expiresAt, locale);
  const title = item.type === "milk" ? t("chiller.milk") : name ?? t("chiller.parts");

  return (
    <div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">
        {item.type === "pump_parts" ? t("chiller.washBy", { time: when }) : t("chiller.useBy", { time: when })}
      </p>
    </div>
  );
}
