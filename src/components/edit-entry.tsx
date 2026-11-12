"use client";

import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DecimalInput } from "@/components/decimal-input";
import { Input } from "@/components/ui/input";
import { SavingLabel } from "@/components/saving-label";
import { WhenField, useWhen } from "@/components/when-field";
import { useI18n } from "@/i18n/provider";
import { formatDecimal, parseDecimal } from "@/lib/decimal";
import { milkExpiresAt } from "@/lib/storage-rules";
import { afterEntry } from "@/lib/optimistic-care";
import { createClient } from "@/lib/supabase/client";
import { clearChillerItem, dropChillerItem, invalidateChiller, upsertChillerItem } from "@/lib/chiller-cache";
import { forgetChillerItem, markChillerCleared, type ChillerLocation } from "@/lib/device-care";
import type { ClearReason, LiveChillerItem } from "@/lib/chiller-live";

export type LogEdit = {
  id: string;
  kind: string;
  occurredAt: string;
  amountMl: number | null;
  durationSeconds: number | null;
};

export type ChillerEdit = {
  id: string;
  type: "milk" | "pump_parts";
  location: ChillerLocation;
  storedAt: string;
  volumeMl: number | null;
  note: string | null;
};

export function EditEntryDialog({
  log,
  chiller,
  familyId,
  washByHours,
  onClose,
  onSaved,
}: {
  log: LogEdit | null;
  chiller: ChillerEdit | null;
  familyId?: string | null;
  washByHours: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const open = Boolean(log || chiller);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false}>
        {log ? <LogEditor key={log.id} entry={log} onClose={onClose} onSaved={onSaved} /> : null}
        {chiller ? (
          <ChillerEditor
            key={chiller.id}
            entry={chiller}
            familyId={familyId ?? null}
            washByHours={washByHours}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LogEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: LogEdit;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const { when, setWhen } = useWhen(entry.occurredAt);
  const [amount, setAmount] = useState(entry.amountMl ? formatDecimal(entry.amountMl, locale) : "");
  const [minutes, setMinutes] = useState(
    entry.durationSeconds ? formatDecimal(Math.max(1, Math.round(entry.durationSeconds / 60)), locale) : "",
  );
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const showAmount = entry.kind === "feed" || entry.kind === "pump";
  const showMinutes = entry.kind === "feed" && entry.amountMl == null || entry.kind === "pump";

  async function save() {
    setPending("save");
    const supabase = createClient();
    const patch: Record<string, unknown> = { occurred_at: when.toISOString() };
    const parsedAmount = parseDecimal(amount);
    const parsedMinutes = parseDecimal(minutes);
    if (showAmount && amount.trim()) {
      if (parsedAmount === null) {
        setPending(null);
        toast(t("common.failed"));
        return;
      }
      patch.amount_ml = Math.round(parsedAmount);
    }
    if (showMinutes && minutes.trim()) {
      if (parsedMinutes === null) {
        setPending(null);
        toast(t("common.failed"));
        return;
      }
      patch.duration_seconds = Math.round(parsedMinutes * 60);
    }
    setPending(null);
    onClose();
    void afterEntry(entry.id, async () => {
      const { error } = await supabase.from("logs").update(patch).eq("id", entry.id).is("deleted_at", null);
      if (error) {
        toast(error.message || t("common.failed"), {
          action: { label: t("common.retry"), onClick: () => undefined },
        });
        return;
      }
      void onSaved();
    });
  }

  return (
    <EditorFrame
      title={t("edit.title")}
      pending={pending}
      confirm={confirm}
      onCancel={() => setConfirm(false)}
      onAskDelete={() => setConfirm(true)}
      onDelete={() =>
        void softDelete({
          table: "logs",
          id: entry.id,
          t,
          setPending,
          onClose,
          onSaved,
        })
      }
      onSave={() => void save()}
    >
      <div className="flex flex-col gap-4">
      {showAmount ? (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("feed.amount")}
          <DecimalInput locale={locale} value={amount} onValueChange={setAmount} />
        </label>
      ) : null}
      {showMinutes ? (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("dbf.duration")}
          <DecimalInput locale={locale} value={minutes} onValueChange={setMinutes} />
        </label>
      ) : null}
      </div>
      <WhenField when={when} onChange={setWhen} />
    </EditorFrame>
  );
}

function ChillerEditor({
  entry,
  familyId,
  washByHours,
  onClose,
  onSaved,
}: {
  entry: ChillerEdit;
  familyId: string | null;
  washByHours: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const { when, setWhen } = useWhen(entry.storedAt);
  const [volume, setVolume] = useState(entry.volumeMl ? formatDecimal(entry.volumeMl, locale) : "");
  const [note, setNote] = useState(entry.note ?? "");
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    setPending("save");
    const storedAt = when;
    const expiresAt =
      entry.type === "milk"
        ? milkExpiresAt(storedAt, entry.location)
        : new Date(storedAt.getTime() + washByHours * 60 * 60 * 1000);
    let volumeMl: number | null = null;
    if (entry.type === "milk" && volume.trim()) {
      const parsed = parseDecimal(volume);
      if (parsed === null) {
        setPending(null);
        toast(t("common.failed"));
        return;
      }
      volumeMl = Math.round(parsed);
    }
    const previous = dropChillerItem(queryClient, familyId, entry.id);
    upsertChillerItem(queryClient, familyId, {
      ...(previous ?? emptyChiller(entry)),
      storedAt: storedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      volumeMl,
      note: entry.type === "milk" ? note.trim() || null : null,
    });
    const supabase = createClient();
    const { error } = await supabase
      .from("chiller_items")
      .update({
        stored_at: storedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        volume_ml: volumeMl,
        note: entry.type === "milk" ? note.trim() || null : null,
      })
      .eq("id", entry.id)
      .is("deleted_at", null);
    if (error && previous) upsertChillerItem(queryClient, familyId, previous);
    setPending(null);
    if (error) {
      toast(error.message || t("common.failed"));
      return;
    }
    await invalidateChiller(queryClient, familyId);
    await onSaved();
    onClose();
  }

  async function clear(reason: ClearReason) {
    setPending("save");
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      setPending(null);
      toast(t("common.failed"));
      return;
    }
    const clearedAt = new Date().toISOString();
    clearChillerItem(queryClient, familyId, entry.id, clearedAt, reason);
    const { error } = await supabase
      .from("chiller_items")
      .update({ cleared_at: clearedAt, cleared_reason: reason, cleared_by: userId })
      .eq("id", entry.id)
      .is("cleared_at", null)
      .is("deleted_at", null);
    setPending(null);
    if (error) {
      await invalidateChiller(queryClient, familyId);
      toast(error.message || t("common.failed"));
      return;
    }
    markChillerCleared(entry.id, clearedAt, reason);
    await invalidateChiller(queryClient, familyId);
    await onSaved();
    onClose();
    toast(t("chiller.cleared"), {
      action: {
        label: t("chiller.undo"),
        onClick: () => {
          void supabase
            .from("chiller_items")
            .update({ cleared_at: null, cleared_reason: null, cleared_by: null })
            .eq("id", entry.id)
            .then(() => invalidateChiller(queryClient, familyId));
        },
      },
    });
  }

  return (
    <EditorFrame
      title={entry.type === "milk" ? t("chiller.milk") : t("chiller.parts")}
      pending={pending}
      confirm={confirm}
      onCancel={() => setConfirm(false)}
      onAskDelete={() => setConfirm(true)}
      onDelete={() =>
        void softDelete({
          table: "chiller_items",
          id: entry.id,
          familyId,
          queryClient,
          t,
          setPending,
          onClose,
          onSaved,
        })
      }
      onSave={() => void save()}
    >
      {entry.type === "milk" ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("feed.amount")}
            <DecimalInput locale={locale} value={volume} onValueChange={setVolume} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("chiller.note")}
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(entry.type === "milk" ? (["used", "discarded"] as const) : (["washed"] as const)).map((reason) => (
          <Button key={reason} type="button" variant="outline" className="min-h-12" onClick={() => void clear(reason)}>
            {t(`chiller.${reason}`)}
          </Button>
        ))}
      </div>
      <WhenField when={when} onChange={setWhen} />
    </EditorFrame>
  );
}

function emptyChiller(entry: ChillerEdit): LiveChillerItem {
  return {
    id: entry.id,
    type: entry.type,
    location: entry.location,
    storedAt: entry.storedAt,
    expiresAt: entry.storedAt,
    pumpId: null,
    volumeMl: entry.volumeMl,
    note: entry.note,
    pumpName: null,
    babyId: null,
    babyName: null,
    clearedAt: null,
    clearedReason: null,
  };
}

function EditorFrame({
  title,
  children,
  pending,
  confirm,
  onSave,
  onAskDelete,
  onDelete,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  pending: "save" | "delete" | null;
  confirm: boolean;
  onSave: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-0 w-full flex-col overflow-hidden">
      <div data-slot="dialog-header" className="safe-x shrink-0 pt-2">
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
      </div>
      <DialogDescription className="sr-only">{title}</DialogDescription>
      <div data-slot="dialog-scroll" data-vaul-no-drag className="safe-x flex min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain py-3">{children}</div>
      <div data-slot="dialog-footer" className="safe-x flex shrink-0 flex-col gap-2 border-t border-line bg-background pt-3">
        {confirm ? (
          <>
            <p className="text-sm">{t("edit.deleteConfirm")}</p>
            <Button type="button" variant="destructive" onClick={onDelete} disabled={pending !== null}>
              {pending === "delete" ? <SavingLabel label={t("common.saving")} /> : t("edit.delete")}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.back")}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={onSave} disabled={pending !== null}>
              {pending === "save" ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
            </Button>
            <Button type="button" variant="destructive" onClick={onAskDelete}>
              {t("edit.delete")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

async function softDelete({
  table,
  id,
  familyId,
  queryClient,
  t,
  setPending,
  onClose,
  onSaved,
}: {
  table: "logs" | "chiller_items" | "weight_logs";
  id: string;
  familyId?: string | null;
  queryClient?: QueryClient;
  t: (key: "common.failed" | "edit.deleted" | "chiller.undo") => string;
  setPending: (value: "save" | "delete" | null) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  setPending("delete");
  const supabase = createClient();
  const deletedAt = new Date().toISOString();
  try {
    await afterEntry(id, async () => {
      const { error } = await supabase.from(table).update({ deleted_at: deletedAt }).eq("id", id).is("deleted_at", null);
      if (error) throw new Error(error.message);
    });
  } catch (error) {
    setPending(null);
    toast(error instanceof Error ? error.message : t("common.failed"));
    return;
  }
  const removed = table === "chiller_items" && queryClient ? dropChillerItem(queryClient, familyId, id) : null;
  if (table === "chiller_items") forgetChillerItem(id);
  setPending(null);
  onClose();
  void onSaved();
  toast(t("edit.deleted"), {
    action: {
      label: t("chiller.undo"),
      onClick: () => {
        if (removed && queryClient) upsertChillerItem(queryClient, familyId, removed);
        void supabase
          .from(table)
          .update({ deleted_at: null })
          .eq("id", id)
          .then(() => {
            if (familyId && queryClient) void invalidateChiller(queryClient, familyId);
            return onSaved();
          });
      },
    },
  });
}
