"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SavingLabel } from "@/components/saving-label";
import { useI18n } from "@/i18n/provider";
import { markChillerCleared, markChillerRestored } from "@/lib/device-care";
import type { ClearReason } from "@/lib/chiller-live";
import { createClient } from "@/lib/supabase/client";

export type UndoItem = {
  id: string;
  type: "milk" | "pump_parts";
  expiresAt: string;
};

export function useChillerUndo() {
  const [items, setItems] = useState<UndoItem[] | null>(null);
  const timer = useRef<number | null>(null);

  function show(next: UndoItem[]) {
    if (timer.current) window.clearTimeout(timer.current);
    setItems(next);
    timer.current = window.setTimeout(() => setItems(null), 5000);
  }

  function dismiss() {
    if (timer.current) window.clearTimeout(timer.current);
    setItems(null);
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { items, show, dismiss };
}

export async function restoreChillerItems(items: UndoItem[]) {
  if (items.length === 0) return true;
  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chiller_items")
    .update({ cleared_at: null, cleared_reason: null, cleared_by: null })
    .in(
      "id",
      items.map((item) => item.id),
    );
  if (error) return false;
  const expiredMilk = items.filter(
    (item) => item.type === "milk" && new Date(item.expiresAt).getTime() <= Date.now(),
  );
  if (expiredMilk.length > 0) {
    await supabase
      .from("chiller_items")
      .update({ notified_at: now })
      .in(
        "id",
        expiredMilk.map((item) => item.id),
      );
  }
  for (const item of items) markChillerRestored(item.id);
  return true;
}

export function ChillerUndoToast({
  items,
  onDone,
}: {
  items: UndoItem[] | null;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!items || items.length === 0) return;
    const snapshot = items;
    const id = toast(t("chiller.cleared"), {
      duration: 5000,
      action: {
        label: t("chiller.undo"),
        onClick: () => {
          void restoreChillerItems(snapshot).then((ok) => {
            if (ok) done.current();
          });
        },
      },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [items, t]);

  return null;
}

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
      <button type="button" onClick={() => setConfirming(true)} className="shrink-0 text-sm font-semibold text-danger">
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
