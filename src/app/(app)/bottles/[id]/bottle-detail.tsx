"use client";

import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";

export function BottleDetail({ id }: { id: string }) {
  const { t } = useI18n();

  return (
    <Screen titleKey="bottles.detailTitle" ledeKey="bottles.detailLede" backHref="/bottles">
      <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">
        {t("bottles.detailId", { id })}
      </p>
    </Screen>
  );
}
