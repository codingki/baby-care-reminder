"use client";

import { useState } from "react";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";

export default function FeedPage() {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");

  return (
    <Screen titleKey="feed.title" ledeKey="feed.lede" backHref="/">
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-ml">
        {t("feed.amount")}
        <input
          id="feed-ml"
          type="number"
          inputMode="decimal"
          min={1}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
        />
      </label>
    </Screen>
  );
}
