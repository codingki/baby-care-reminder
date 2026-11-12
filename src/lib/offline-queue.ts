export type QueueKind = "pump" | "log" | "chiller" | "weight";

export type QueuedItem = {
  id: string;
  kind: QueueKind;
  row: Record<string, unknown>;
};

const KEY = "bcr_offline_logs_v1";

export function readQueue(): QueuedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedItem[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        (item.kind === "pump" || item.kind === "log" || item.kind === "chiller" || item.kind === "weight") &&
        typeof item.row === "object",
    );
  } catch {
    return [];
  }
}

export function enqueue(kind: QueueKind, row: Record<string, unknown>) {
  const next = [...readQueue(), { id: crypto.randomUUID(), kind, row }];
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function replaceQueue(items: QueuedItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
}
