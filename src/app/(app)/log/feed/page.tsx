"use client";

import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";

export default function FeedPage() {
  const { t } = useI18n();

  return (
    <Screen titleKey="feed.title" ledeKey="feed.lede" backHref="/">
      <p className="rounded-3xl border border-line bg-card px-5 py-4 text-base font-semibold">
        {t("feed.amount")}
      </p>
    </Screen>
  );
}
