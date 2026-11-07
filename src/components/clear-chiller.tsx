"use client";

import { useRef, useState } from "react";
import { SavingLabel } from "@/components/saving-label";
import { useI18n } from "@/i18n/provider";
import { markChillerCleared } from "@/lib/device-care";
import type { ClearReason } from "@/lib/chiller-live";
import { createClient } from "@/lib/supabase/client";

export function ClearChiller({
  id,
  type,
  onCleared,
}: {
  id: string;
  type: "milk" | "pump_parts";
  onCleared: (reason: ClearReason) => void;
}) {
  const { t } = useI18n();
  const lock = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<ClearReason | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reasons: ClearReason[] = type === "milk" ? ["used", "discarded"] : ["washed"];

  async function clear(reason: ClearReason) {
    if (lock.current) return;
    lock.current = true;
    setPending(reason);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        setMessage(t("common.failed"));
        return;
      }
      const clearedAt = new Date().toISOString();
      const { error } = await supabase
        .from("chiller_items")
        .update({ cleared_at: clearedAt, cleared_reason: reason, cleared_by: userId })
        .eq("id", id)
        .is("cleared_at", null);
      if (error) {
        setMessage(t("common.failed"));
        return;
      }
      markChillerCleared(id, clearedAt, reason);
      onCleared(reason);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm font-semibold text-accent">
        {t("chiller.clear")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{t("chiller.clearConfirm")}</p>
      <div className="flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={pending !== null}
            aria-busy={pending === reason}
            onClick={() => void clear(reason)}
            className="min-h-11 rounded-full border border-line px-3 text-sm font-semibold disabled:opacity-50"
          >
            {pending === reason ? <SavingLabel label={t("common.saving")} /> : t(`chiller.${reason}`)}
          </button>
        ))}
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => setConfirming(false)}
          className="min-h-11 px-2 text-sm font-semibold text-muted"
        >
          {t("common.back")}
        </button>
      </div>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
