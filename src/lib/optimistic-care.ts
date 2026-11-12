"use client";

import { toast } from "sonner";
import { scopedKey, type CareScope } from "@/lib/care-queries";
import { chillerKey, dropChillerItem, upsertChillerItem } from "@/lib/chiller-cache";
import type { LiveChillerItem } from "@/lib/chiller-live";
import { diaperIntervalMinutes, feedIntervalMinutes } from "@/lib/feed-interval";
import { peekFamilyContext } from "@/lib/family-context";
import { getCareQueryClient } from "@/lib/query-provider";
import { createSaveTracker } from "@/lib/save-concurrency";
import { saveChillerItem, saveLog, saveWeight, type LogInput } from "@/lib/save-log";
import { createClient } from "@/lib/supabase/client";

export const SAVE_FAILURES_KEY = ["save-failures"] as const;

export type SaveSeed = Record<string, string>;

export type FailedSave = {
  id: string;
  sheet: string;
  seed: SaveSeed;
  title: string;
};

type CareLog = {
  id: string;
  kind: string;
  occurredAt: string;
  amountMl: number | null;
  diaperKind: string | null;
  durationSeconds: number | null;
  feedKind: string | null;
  breastSide: string | null;
  poopColor: string | null;
  poopAmount: string | null;
  pending?: boolean;
  by?: string | null;
};

type HomeLike = {
  logs: CareLog[];
  diaperStart: string | null;
  feedStart: string | null;
  diaperAt: string | null;
  feedAt: string | null;
  lastFamilyPump: string | null;
  baby: { intervalMinutes: number | null; diaperIntervalMinutes: number | null } | null;
};

type TimelineLike = { logs: CareLog[] };

type WeightCard = { id: string; weights: { id: string; grams: number; on: string; pending?: boolean }[] };

type WeightLike = { babies: WeightCard[] };

const tracker = createSaveTracker((scope) => {
  void refreshScope(scope);
});

export function entryScope(kind: "log" | "chiller" | "weight", familyId: string, babyId: string | null) {
  return kind === "chiller" ? `chiller:${familyId}` : `${kind}:${familyId}:${babyId ?? ""}`;
}

export function afterEntry(id: string, task: () => Promise<void>) {
  return tracker.after(id, task);
}

export function readFailures(): FailedSave[] {
  return getCareQueryClient()?.getQueryData<FailedSave[]>(SAVE_FAILURES_KEY) ?? [];
}

function writeFailures(next: FailedSave[]) {
  getCareQueryClient()?.setQueryData(SAVE_FAILURES_KEY, next);
}

function rememberFailure(failed: FailedSave) {
  writeFailures([failed, ...readFailures().filter((item) => item.id !== failed.id)]);
}

function forgetFailure(id: string) {
  writeFailures(readFailures().filter((item) => item.id !== id));
}

function plus(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function duePatch(current: HomeLike, logs: CareLog[]): HomeLike {
  const next = { ...current, logs: logs.slice(0, 8) };
  const latest = (kind: string) =>
    logs
      .filter((log) => log.kind === kind)
      .sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1))[0];
  const diaper = latest("diaper");
  const feed = latest("feed");
  const pump = latest("pump");
  if (diaper && current.baby) {
    next.diaperStart = diaper.occurredAt;
    next.diaperAt = plus(diaper.occurredAt, diaperIntervalMinutes(current.baby.diaperIntervalMinutes));
  }
  if (feed && current.baby) {
    next.feedStart = feed.occurredAt;
    next.feedAt = plus(feed.occurredAt, feedIntervalMinutes(current.baby.intervalMinutes));
  }
  if (pump) next.lastFamilyPump = pump.occurredAt;
  return next;
}

function logFromInput(id: string, input: LogInput, occurredAt: string): CareLog {
  const breast = input.kind === "feed" && input.feedKind === "breast";
  const dirty = input.kind === "diaper" && (input.diaperKind === "dirty" || input.diaperKind === "mixed");
  return {
    id,
    kind: input.kind,
    occurredAt,
    amountMl: breast ? null : (input.amountMl ?? null),
    diaperKind: input.kind === "diaper" ? (input.diaperKind ?? null) : null,
    durationSeconds: input.durationSeconds ?? null,
    feedKind: input.kind === "feed" ? (breast ? "breast" : "bottle") : null,
    breastSide: breast ? (input.breastSide ?? null) : null,
    poopColor: dirty ? (input.poopColor ?? null) : null,
    poopAmount: dirty ? (input.poopAmount ?? null) : null,
    pending: true,
  };
}

async function placeLog(scope: CareScope, log: CareLog) {
  const client = getCareQueryClient();
  if (!client) return;
  const homeKey = scopedKey("home", scope);
  const timeKey = scopedKey("timeline", scope);
  await client.cancelQueries({ queryKey: homeKey });
  await client.cancelQueries({ queryKey: timeKey });
  client.setQueryData<HomeLike | undefined>(homeKey, (current) => {
    if (!current?.logs) return current;
    return duePatch(current, [log, ...current.logs.filter((row) => row.id !== log.id)]);
  });
  client.setQueryData<TimelineLike | undefined>(timeKey, (current) => {
    if (!current?.logs) return current;
    return { ...current, logs: [log, ...current.logs.filter((row) => row.id !== log.id)] };
  });
}

function removeLog(scope: CareScope, id: string) {
  const client = getCareQueryClient();
  if (!client) return;
  client.setQueryData<HomeLike | undefined>(scopedKey("home", scope), (current) => {
    if (!current?.logs) return current;
    return duePatch(
      current,
      current.logs.filter((row) => row.id !== id),
    );
  });
  client.setQueryData<TimelineLike | undefined>(scopedKey("timeline", scope), (current) => {
    if (!current?.logs) return current;
    return { ...current, logs: current.logs.filter((row) => row.id !== id) };
  });
}

function settleLog(scope: CareScope, id: string) {
  const client = getCareQueryClient();
  if (!client) return;
  const clear = (logs: CareLog[]) => logs.map((row) => (row.id === id ? { ...row, pending: false } : row));
  client.setQueryData<HomeLike | undefined>(scopedKey("home", scope), (current) =>
    current?.logs ? { ...current, logs: clear(current.logs) } : current,
  );
  client.setQueryData<TimelineLike | undefined>(scopedKey("timeline", scope), (current) =>
    current?.logs ? { ...current, logs: clear(current.logs) } : current,
  );
}

async function placeChiller(familyId: string, item: LiveChillerItem) {
  const client = getCareQueryClient();
  if (!client) return;
  await client.cancelQueries({ queryKey: chillerKey(familyId) });
  upsertChillerItem(client, familyId, item);
}

function settleChiller(familyId: string, id: string) {
  const client = getCareQueryClient();
  if (!client) return;
  client.setQueryData<{ items: LiveChillerItem[] } | undefined>(chillerKey(familyId), (current) => {
    if (!current) return current;
    return { ...current, items: current.items.map((item) => (item.id === id ? { ...item, pending: false } : item)) };
  });
}

async function placeWeight(scope: CareScope, id: string, grams: number, on: string) {
  const client = getCareQueryClient();
  if (!client || !scope.babyId) return;
  const key = scopedKey("weights", scope);
  await client.cancelQueries({ queryKey: key });
  client.setQueryData<WeightLike | undefined>(key, (current) => {
    if (!current?.babies) return current;
    return {
      babies: current.babies.map((baby) =>
        baby.id === scope.babyId
          ? { ...baby, weights: [{ id, grams, on, pending: true }, ...baby.weights.filter((row) => row.id !== id)] }
          : baby,
      ),
    };
  });
  const homeKey = scopedKey("home", scope);
  client.setQueryData<HomeLike | undefined>(homeKey, (current) => {
    if (!current?.logs) return current;
    const log: CareLog = {
      id,
      kind: "weight",
      occurredAt: `${on}T12:00:00`,
      amountMl: grams,
      diaperKind: null,
      durationSeconds: null,
      feedKind: null,
      breastSide: null,
      poopColor: null,
      poopAmount: null,
      pending: true,
    };
    return { ...current, logs: [log, ...current.logs.filter((row) => row.id !== id)].slice(0, 8) };
  });
}

function removeWeight(scope: CareScope, id: string) {
  const client = getCareQueryClient();
  if (!client) return;
  client.setQueryData<WeightLike | undefined>(scopedKey("weights", scope), (current) => {
    if (!current?.babies) return current;
    return { babies: current.babies.map((baby) => ({ ...baby, weights: baby.weights.filter((row) => row.id !== id) })) };
  });
  removeLog(scope, id);
}

function settleWeight(scope: CareScope, id: string) {
  const client = getCareQueryClient();
  if (!client) return;
  client.setQueryData<WeightLike | undefined>(scopedKey("weights", scope), (current) => {
    if (!current?.babies) return current;
    return {
      babies: current.babies.map((baby) => ({
        ...baby,
        weights: baby.weights.map((row) => (row.id === id ? { ...row, pending: false } : row)),
      })),
    };
  });
  settleLog(scope, id);
}

function scopeFromContext(): CareScope | null {
  const context = peekFamilyContext();
  if (!context) return null;
  return { userId: context.userId, familyId: context.familyId, babyId: context.babyId };
}

export function launchLog(options: {
  input: LogInput & { id: string };
  seed: SaveSeed;
  sheet: string;
  title: string;
  failText: string;
  retryText: string;
  onClose: () => void;
  onEdit: (failed: FailedSave) => void;
  onNeedsFamily?: () => void;
}) {
  const scope = scopeFromContext();
  if (!scope?.babyId) {
    options.onNeedsFamily?.();
    return;
  }
  const occurredAt = options.input.occurredAt ?? new Date().toISOString();
  const token = entryScope("log", scope.familyId, scope.babyId);
  const id = options.input.id;
  tracker.add(token);
  void tracker
    .after(id, async () => {
      await placeLog(scope, logFromInput(id, options.input, occurredAt));
      options.onClose();
      const result = await saveLog({ ...options.input, id, occurredAt });
      if (result === "needs-family") {
        removeLog(scope, id);
        options.onNeedsFamily?.();
        return;
      }
      if (result === "error") {
        removeLog(scope, id);
        const failed = { id, sheet: options.sheet, seed: { ...options.seed, id }, title: options.title };
        rememberFailure(failed);
        toast(options.failText, {
          action: { label: options.retryText, onClick: () => options.onEdit(failed) },
        });
        return;
      }
      forgetFailure(id);
      settleLog(scope, id);
    })
    .finally(() => tracker.finish(token));
}

export function launchChiller(options: {
  item: LiveChillerItem;
  seed: SaveSeed;
  title: string;
  failText: string;
  retryText: string;
  washByHours: number;
  onClose: () => void;
  onEdit: (failed: FailedSave) => void;
}) {
  const scope = scopeFromContext();
  if (!scope) return;
  const token = entryScope("chiller", scope.familyId, null);
  const id = options.item.id;
  tracker.add(token);
  void tracker
    .after(id, async () => {
      await placeChiller(scope.familyId, { ...options.item, pending: true });
      options.onClose();
      const saved = await saveChillerItem({
        id,
        type: options.item.type,
        location: options.item.location,
        volumeMl: options.item.volumeMl,
        pumpId: options.item.pumpId,
        washByHours: options.washByHours,
        note: options.item.note,
        babyId: options.item.babyId,
        storedAt: options.item.storedAt,
      });
      const client = getCareQueryClient();
      if (saved.status === "error") {
        if (client) dropChillerItem(client, scope.familyId, id);
        const failed = { id, sheet: "chiller", seed: { ...options.seed, id }, title: options.title };
        rememberFailure(failed);
        toast(options.failText, {
          action: { label: options.retryText, onClick: () => options.onEdit(failed) },
        });
        return;
      }
      forgetFailure(id);
      settleChiller(scope.familyId, id);
    })
    .finally(() => tracker.finish(token));
}

export function launchWeight(options: {
  id: string;
  grams: number;
  weighedOn: string;
  seed: SaveSeed;
  title: string;
  failText: string;
  retryText: string;
  onClose: () => void;
  onEdit: (failed: FailedSave) => void;
  onNeedsFamily?: () => void;
}) {
  const scope = scopeFromContext();
  if (!scope?.babyId) {
    options.onNeedsFamily?.();
    return;
  }
  const token = entryScope("weight", scope.familyId, scope.babyId);
  tracker.add(token);
  void tracker
    .after(options.id, async () => {
      await placeWeight(scope, options.id, options.grams, options.weighedOn);
      options.onClose();
      const saved = await saveWeight({ id: options.id, grams: options.grams, weighedOn: options.weighedOn });
      if (saved.status === "needs-family") {
        removeWeight(scope, options.id);
        options.onNeedsFamily?.();
        return;
      }
      if (saved.status === "error") {
        removeWeight(scope, options.id);
        const failed = { id: options.id, sheet: "weight", seed: { ...options.seed, id: options.id }, title: options.title };
        rememberFailure(failed);
        toast(options.failText, {
          action: { label: options.retryText, onClick: () => options.onEdit(failed) },
        });
        return;
      }
      forgetFailure(options.id);
      settleWeight(scope, options.id);
    })
    .finally(() => tracker.finish(token));
}

async function refreshScope(token: string) {
  if (tracker.count(token) > 0) return;
  const client = getCareQueryClient();
  const context = peekFamilyContext();
  if (!client || !context) return;
  const scope: CareScope = { userId: context.userId, familyId: context.familyId, babyId: context.babyId };
  if (token.startsWith("chiller:")) {
    await client.invalidateQueries({ queryKey: chillerKey(context.familyId) });
    return;
  }
  if (token.startsWith("weight:")) {
    await client.invalidateQueries({ queryKey: scopedKey("weights", scope) });
    return;
  }
  if (!scope.babyId) return;
  const supabase = createClient();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [recent, today] = await Promise.all([
    supabase
      .from("logs")
      .select("id, kind, occurred_at, amount_ml, diaper_kind, duration_seconds, feed_kind, breast_side, poop_color, poop_amount")
      .eq("family_id", scope.familyId)
      .eq("baby_id", scope.babyId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(8),
    supabase
      .from("logs")
      .select("id, kind, occurred_at, amount_ml, diaper_kind, duration_seconds, feed_kind, breast_side, poop_color, poop_amount, logged_by")
      .eq("family_id", scope.familyId)
      .eq("baby_id", scope.babyId)
      .is("deleted_at", null)
      .gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false }),
  ]);
  if (tracker.count(token) > 0) return;
  const mapLog = (row: Record<string, unknown>, id: string): CareLog => ({
    id,
    kind: String(row.kind ?? ""),
    occurredAt: String(row.occurred_at ?? ""),
    amountMl: typeof row.amount_ml === "number" ? row.amount_ml : null,
    diaperKind: typeof row.diaper_kind === "string" ? row.diaper_kind : null,
    durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    feedKind: typeof row.feed_kind === "string" ? row.feed_kind : null,
    breastSide: typeof row.breast_side === "string" ? row.breast_side : null,
    poopColor: typeof row.poop_color === "string" ? row.poop_color : null,
    poopAmount: typeof row.poop_amount === "string" ? row.poop_amount : null,
    pending: false,
    by: typeof row.logged_by === "string" ? row.logged_by : null,
  });
  client.setQueryData<HomeLike | undefined>(scopedKey("home", scope), (current) => {
    if (!current?.logs) return current;
    const pending = current.logs.filter((log) => log.pending);
    const remote = (recent.data ?? []).map((row) => mapLog(row as Record<string, unknown>, String(row.id)));
    const seen = new Set(remote.map((log) => log.id));
    return duePatch(current, [...pending.filter((log) => !seen.has(log.id)), ...remote]);
  });
  client.setQueryData<TimelineLike | undefined>(scopedKey("timeline", scope), (current) => {
    if (!current?.logs) return current;
    const pending = current.logs.filter((log) => log.pending);
    const remote = (today.data ?? []).map((row) => mapLog(row as Record<string, unknown>, String(row.id)));
    const seen = new Set(remote.map((log) => log.id));
    return { ...current, logs: [...pending.filter((log) => !seen.has(log.id)), ...remote] };
  });
}
