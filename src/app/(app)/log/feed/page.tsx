"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { PresetChips, volumePresets, volumeToMl } from "@/components/preset-chips";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useSaveLock } from "@/components/use-save-lock";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { saveLog } from "@/lib/save-log";

export default function FeedPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useSaveLock();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("ml");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadFamilyContext().then((context) => {
      if (context?.unit) setUnit(context.unit);
    });
  }, []);

  async function save() {
    const entered = Number(amount);
    if (!Number.isFinite(entered) || entered <= 0) return;
    const ml = volumeToMl(entered, unit);
    setMessage(null);
    await run(async () => {
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
    });
  }

  return (
    <Screen
      titleKey="feed.title"
      ledeKey="feed.lede"
      backHref="/"
      showLater={false}
      icon={<CareIcon name="feed" className="h-8 w-8" />}
    >
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-ml">
        {unit === "oz" ? t("feed.ounces") : t("feed.amount")}
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
      <PresetChips values={volumePresets(unit)} onPick={(value) => setAmount(String(value))} />
      <button
        type="button"
        onClick={() => void save()}
        disabled={pending}
        aria-busy={pending}
        className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </Screen>
  );
}
