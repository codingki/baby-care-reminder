"use client";

import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";

export default function BottlesPage() {
  const { t } = useI18n();

  return (
    <Screen titleKey="bottles.title" ledeKey="bottles.lede">
      <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">
        {t("bottles.empty")}
      </p>
    </Screen>
  );
}
