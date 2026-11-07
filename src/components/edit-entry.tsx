"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SavingLabel } from "@/components/saving-label";
import { WhenField, useWhen } from "@/components/when-field";
import { useI18n } from "@/i18n/provider";
import { milkExpiresAt } from "@/lib/storage-rules";
import { createClient } from "@/lib/supabase/client";
import type { ChillerLocation } from "@/lib/device-care";

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
  washByHours,
  onClose,
  onSaved,
}: {
  log: LogEdit | null;
  chiller: ChillerEdit | null;
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
          <ChillerEditor key={chiller.id} entry={chiller} washByHours={washByHours} onClose={onClose} onSaved={onSaved} />
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
  const { t } = useI18n();
  const { when, setWhen } = useWhen(entry.occurredAt);
  const [amount, setAmount] = useState(entry.amountMl ? String(entry.amountMl) : "");
  const [minutes, setMinutes] = useState(
    entry.durationSeconds ? String(Math.max(1, Math.round(entry.durationSeconds / 60))) : "",
  );
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const showAmount = entry.kind === "feed" || entry.kind === "pump";
  const showMinutes = entry.kind === "feed" && entry.amountMl == null || entry.kind === "pump";

  async function save() {
    setPending("save");
    const supabase = createClient();
    const patch: Record<string, unknown> = { occurred_at: when.toISOString() };
    if (showAmount && amount.trim()) patch.amount_ml = Math.round(Number(amount));
    if (showMinutes && minutes.trim()) patch.duration_seconds = Math.round(Number(minutes) * 60);
    const { error } = await supabase.from("logs").update(patch).eq("id", entry.id).is("deleted_at", null);
    setPending(null);
    if (error) {
      toast(error.message || t("common.failed"));
      return;
    }
    await onSaved();
    onClose();
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
      <WhenField when={when} onChange={setWhen} />
      {showAmount ? (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("feed.amount")}
          <Input type="number" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
      ) : null}
      {showMinutes ? (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          {t("dbf.duration")}
          <Input type="number" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>
      ) : null}
    </EditorFrame>
  );
}

function ChillerEditor({
  entry,
  washByHours,
  onClose,
  onSaved,
}: {
  entry: ChillerEdit;
  washByHours: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { when, setWhen } = useWhen(entry.storedAt);
  const [volume, setVolume] = useState(entry.volumeMl ? String(entry.volumeMl) : "");
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
    const supabase = createClient();
    const { error } = await supabase
      .from("chiller_items")
      .update({
        stored_at: storedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        volume_ml: entry.type === "milk" && volume.trim() ? Math.round(Number(volume)) : null,
        note: entry.type === "milk" ? note.trim() || null : null,
      })
      .eq("id", entry.id)
      .is("deleted_at", null);
    setPending(null);
    if (error) {
      toast(error.message || t("common.failed"));
      return;
    }
    await onSaved();
    onClose();
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
          t,
          setPending,
          onClose,
          onSaved,
        })
      }
      onSave={() => void save()}
    >
      <WhenField when={when} onChange={setWhen} />
      {entry.type === "milk" ? (
        <>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("feed.amount")}
            <Input type="number" inputMode="decimal" value={volume} onChange={(event) => setVolume(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t("chiller.note")}
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </>
      ) : null}
    </EditorFrame>
  );
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
    <div className="flex max-h-[inherit] flex-col">
      <DialogTitle className="safe-x pt-2 text-lg font-semibold">{title}</DialogTitle>
      <DialogDescription className="sr-only">{title}</DialogDescription>
      <div className="safe-x flex min-h-0 flex-col gap-3 overflow-y-auto py-3">{children}</div>
      <div className="safe-x flex flex-col gap-2 border-t border-line py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
  t,
  setPending,
  onClose,
  onSaved,
}: {
  table: "logs" | "chiller_items" | "weight_logs";
  id: string;
  t: (key: "common.failed" | "edit.deleted" | "chiller.undo") => string;
  setPending: (value: "save" | "delete" | null) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  setPending("delete");
  const supabase = createClient();
  const deletedAt = new Date().toISOString();
  const { error } = await supabase.from(table).update({ deleted_at: deletedAt }).eq("id", id);
  setPending(null);
  if (error) {
    toast(error.message || t("common.failed"));
    return;
  }
  await onSaved();
  onClose();
  toast(t("edit.deleted"), {
    action: {
      label: t("chiller.undo"),
      onClick: () => {
        void supabase
          .from(table)
          .update({ deleted_at: null })
          .eq("id", id)
          .then(() => onSaved());
      },
    },
  });
}
