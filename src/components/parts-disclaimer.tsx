"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
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
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-expanded={show}
        aria-controls={show ? panelId : undefined}
        aria-label={t("pump.disclaimerInfo")}
        onClick={() => setOpen((value) => !value)}
        className="shrink-0 bg-background text-base text-accent"
      >
        i
      </Button>
    </div>
  );
}
