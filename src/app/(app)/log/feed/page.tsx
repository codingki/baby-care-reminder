"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { saveLog } from "@/lib/save-log";

export default function FeedPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.suggestedMl) setAmount(String(context.suggestedMl));
    });
  }, []);

  async function save() {
    const ml = Number(amount);
    if (!Number.isFinite(ml) || ml <= 0) return;
    const result = await saveLog({ kind: "feed", amountMl: Math.round(ml) });
    if (result === "needs-family") {
      router.push("/onboarding");
      return;
    }
    if (result === "error") {
      setMessage(t("common.failed"));
      return;
    }
    setMessage(result === "queued" ? t("common.queued") : t("common.saved"));
    if (result === "synced") router.push("/");
  }

  return (
    <Screen titleKey="feed.title" ledeKey="feed.lede" backHref="/" showLater={false}>
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
      <button
        type="button"
        onClick={() => void save()}
        className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground"
      >
        {t("common.save")}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </Screen>
  );
}
