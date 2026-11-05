"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { saveLog } from "@/lib/save-log";

const choices = [
  { key: "wet", value: "wet" },
  { key: "dirty", value: "dirty" },
  { key: "both", value: "mixed" },
] as const;

export default function DiaperPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function choose(diaperKind: "wet" | "dirty" | "mixed") {
    const result = await saveLog({ kind: "diaper", diaperKind });
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
    <Screen titleKey="diaper.title" ledeKey="diaper.lede" backHref="/" showLater={false}>
      <div className="grid grid-cols-1 gap-3">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            onClick={() => void choose(choice.value)}
            className="min-h-16 rounded-3xl border border-line bg-card text-lg font-semibold text-accent"
          >
            {t(`diaper.${choice.key}`)}
          </button>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </Screen>
  );
}
