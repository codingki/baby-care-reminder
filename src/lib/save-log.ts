import {
  rememberChillerItem,
  type ChillerLocation,
} from "@/lib/device-care";
import { loadFamilyContext } from "@/lib/family-context";
import { enqueue, readQueue, replaceQueue, type QueueKind } from "@/lib/offline-queue";
import { milkExpiresAt } from "@/lib/storage-rules";
import { createClient } from "@/lib/supabase/client";

export type LogInput = {
  kind: "diaper" | "feed" | "pump";
  diaperKind?: "wet" | "dirty" | "mixed";
  feedKind?: "bottle" | "breast";
  breastSide?: "left" | "right";
  amountMl?: number;
  durationSeconds?: number | null;
  pumpId?: string;
  occurredAt?: string;
};

type WriteError = { message?: string; code?: string };

function browserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function shouldQueue(error: WriteError) {
  if (error.code === "23503") return true;
  const message = error.message ?? "";
  return /fetch|network|offline|Failed to fetch|Load failed|NetworkError/i.test(message);
}

async function writeRow(kind: QueueKind, row: Record<string, unknown>) {
  if (browserOffline()) {
    enqueue(kind, row);
    return "queued" as const;
  }
  const table = kind === "log" ? "logs" : kind === "pump" ? "family_pumps" : "chiller_items";
  const supabase = createClient();
  const { error } = await supabase.from(table).insert(row);
  if (!error) return "synced" as const;
  if (shouldQueue(error)) {
    enqueue(kind, row);
    return "queued" as const;
  }
  return "error" as const;
}

export async function saveLog(input: LogInput): Promise<"synced" | "queued" | "needs-family" | "error"> {
  const context = await loadFamilyContext();
  if (!context?.babyId) return "needs-family";

  const breast = input.kind === "feed" && input.feedKind === "breast";
  const row: Record<string, unknown> = {
    baby_id: context.babyId,
    family_id: context.familyId,
    logged_by: context.userId,
    kind: input.kind,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    feed_kind: input.kind === "feed" ? (breast ? "breast" : "bottle") : null,
    breast_side: breast ? input.breastSide ?? null : null,
    diaper_kind: input.kind === "diaper" ? input.diaperKind : null,
    amount_ml: breast ? null : (input.amountMl ?? null),
    duration_seconds: input.durationSeconds ?? null,
    pump_id: input.kind === "pump" ? input.pumpId : null,
  };

  return writeRow("log", row);
}

export async function saveChillerItem(input: {
  type: "milk" | "pump_parts";
  location: ChillerLocation;
  volumeMl: number | null;
  pumpId: string | null;
  washByHours: number;
  note?: string | null;
}): Promise<{ status: "synced" | "queued" | "error"; id: string }> {
  const id = crypto.randomUUID();
  const context = await loadFamilyContext();
  const storedAt = new Date();
  const expiresAt =
    input.type === "milk"
      ? milkExpiresAt(storedAt, input.location)
      : new Date(storedAt.getTime() + input.washByHours * 60 * 60 * 1000);
  const note = input.type === "milk" ? input.note?.trim() || null : null;
  const item = {
    id,
    type: input.type,
    location: input.type === "pump_parts" ? ("fridge" as const) : input.location,
    storedAt: storedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    pumpId: input.pumpId,
    volumeMl: input.type === "milk" ? input.volumeMl : null,
    note,
  };
  rememberChillerItem(item);
  if (!context?.babyId) return { status: "queued", id };

  const row = {
    id,
    baby_id: context.babyId,
    family_id: context.familyId,
    type: item.type,
    location: item.location,
    stored_at: item.storedAt,
    expires_at: item.expiresAt,
    volume_ml: item.volumeMl,
    pump_id: input.pumpId,
    note,
    created_by: context.userId,
  };
  const status = await writeRow("chiller", row);
  return { status, id };
}

export async function saveFamilyPump(row: Record<string, unknown>) {
  return writeRow("pump", row);
}

export async function removeFamilyPump(id: string) {
  if (browserOffline()) return;
  const supabase = createClient();
  await supabase.from("family_pumps").delete().eq("id", id);
}

export async function flushOfflineQueue(): Promise<void> {
  const pending = readQueue();
  if (pending.length === 0) return;
  const order: Record<QueueKind, number> = { pump: 0, log: 1, chiller: 2 };
  const sorted = [...pending].sort((left, right) => order[left.kind] - order[right.kind]);
  const supabase = createClient();
  const left = [];
  for (const item of sorted) {
    const table =
      item.kind === "log" ? "logs" : item.kind === "pump" ? "family_pumps" : "chiller_items";
    const { error } = await supabase.from(table).insert(item.row);
    if (error) left.push(item);
  }
  replaceQueue(left);
}
