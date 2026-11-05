"use client";

import { useId, useState } from "react";
import { useI18n } from "@/i18n/provider";

export function PartsDisclaimer({ time, seen }: { time: string; seen: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const show = !seen || open;

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm font-semibold">{t("pump.partsExpiry", { time })}</p>
        {show ? (
          <p id={panelId} className="text-sm leading-6 text-muted">
            {t("pump.disclaimer", { time })}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-expanded={show}
        aria-controls={show ? panelId : undefined}
        aria-label={t("pump.disclaimerInfo")}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-background text-base font-semibold text-accent"
      >
        i
      </button>
    </div>
  );
}
