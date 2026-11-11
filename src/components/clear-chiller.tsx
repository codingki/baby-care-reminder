"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { useQueryClient } from "@tanstack/react-query";
import { clearChillerItem, invalidateChiller, restoreChillerCache } from "@/lib/chiller-cache";
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

export async function restoreChillerItems(items: UndoItem[], familyId?: string | null) {
  if (items.length === 0) return { ok: true as const, familyId: familyId ?? null };
  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chiller_items")
    .update({ cleared_at: null, cleared_reason: null, cleared_by: null })
    .in(
      "id",
      items.map((item) => item.id),
    );
  if (error) return { ok: false as const, familyId: familyId ?? null };
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
  return { ok: true as const, familyId: familyId ?? null };
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
          void restoreChillerItems(snapshot).then((result) => {
            if (result.ok) done.current();
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
  familyId,
  onCleared,
}: {
  id: string;
  type: "milk" | "pump_parts";
  familyId?: string | null;
  onCleared: (reason: ClearReason) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
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
      clearChillerItem(queryClient, familyId, id, clearedAt, reason);
      const { error } = await supabase
        .from("chiller_items")
        .update({ cleared_at: clearedAt, cleared_reason: reason, cleared_by: userId })
        .eq("id", id)
        .is("cleared_at", null);
      if (error) {
        await invalidateChiller(queryClient, familyId);
        setMessage(t("common.failed"));
        return;
      }
      markChillerCleared(id, clearedAt, reason);
      await invalidateChiller(queryClient, familyId);
      onCleared(reason);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-auto min-h-0 shrink-0 px-0 text-sm"
        onClick={() => setConfirming(true)}
      >
        {t("chiller.clear")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{t("chiller.clearConfirm")}</p>
      <div className="flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <Button
            key={reason}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending !== null}
            aria-busy={pending === reason}
            onClick={() => void clear(reason)}
            className="min-h-11 rounded-full px-3 text-sm"
          >
            {pending === reason ? <SavingLabel label={t("common.saving")} /> : t(`chiller.${reason}`)}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending !== null}
          onClick={() => setConfirming(false)}
          className="min-h-11 px-2 text-sm text-muted"
        >
          {t("common.back")}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
