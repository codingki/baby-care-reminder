"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
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
  const lock = useRef(false);
  const [pending, setPending] = useState<"wet" | "dirty" | "mixed" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(diaperKind: "wet" | "dirty" | "mixed") {
    if (lock.current) return;
    lock.current = true;
    setPending(diaperKind);
    setMessage(null);
    try {
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
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <Screen
      titleKey="diaper.title"
      ledeKey="diaper.lede"
      backHref="/"
      showLater={false}
      icon={<CareIcon name="diaper" className="h-8 w-8" />}
    >
      <div className="grid grid-cols-1 gap-3">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            disabled={pending !== null}
            aria-busy={pending === choice.value}
            onClick={() => void choose(choice.value)}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-3xl border border-line bg-card text-lg font-semibold text-accent disabled:opacity-50"
          >
            {pending === choice.value ? (
              <SavingLabel label={t("common.saving")} />
            ) : (
              <>
                <CareIcon name="diaper" className="h-5 w-5" />
                {t(`diaper.${choice.key}`)}
              </>
            )}
          </button>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </Screen>
  );
}
