"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { Badge } from "@/components/ui/badge";
import { ChillerUndoToast, ClearChiller, useChillerUndo, type UndoItem } from "@/components/clear-chiller";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { loadLiveChiller, type LiveChillerItem } from "@/lib/chiller-live";
import { markChillerCleared, pumpLabel, type ChillerItem, type OwnedPump } from "@/lib/device-care";
import { formatSpan, nowMs } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/client";

export default function ChillerPage() {
  const { t } = useI18n();
  const device = useCareStore();
  const [now, setNow] = useState(nowMs);
  const [live, setLive] = useState<LiveChillerItem[] | null>(null);
  const [babyCount, setBabyCount] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<"active" | "cleared">("active");
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [clearAllPending, setClearAllPending] = useState(false);
  const [clearAllError, setClearAllError] = useState<string | null>(null);
  const clearAllLock = useRef(false);
  const undo = useChillerUndo();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowMs()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadLiveChiller().then((result) => {
      if (!result) {
        setState(device.items.length > 0 ? "ready" : "error");
        return;
      }
      setLive(result.items);
      setBabyCount(result.babyCount);
      setState("ready");
    });
  }, [device.items.length, reload]);

  const deviceItems: LiveChillerItem[] = device.items.map((item) => ({
    ...item,
    pumpName: deviceName(item, device.pumps),
    babyId: null,
    babyName: null,
    clearedAt: item.clearedAt ?? null,
    clearedReason: item.clearedReason ?? null,
  }));
  const items = mergeItems(live, deviceItems);
  const active = items.filter((item) => !item.clearedAt);
  const cleared = items.filter((item) => item.clearedAt);
  const expiredMilk = active.filter(
    (item) => item.type === "milk" && new Date(item.expiresAt).getTime() < now,
  );
  const visible = filter === "cleared" ? cleared : active;

  async function clearExpired() {
    if (clearAllLock.current || expiredMilk.length === 0) return;
    clearAllLock.current = true;
    setClearAllPending(true);
    setClearAllError(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        setClearAllError(t("common.failed"));
        return;
      }
      const clearedAt = new Date().toISOString();
      const ids = expiredMilk.map((item) => item.id);
      const { error } = await supabase
        .from("chiller_items")
        .update({ cleared_at: clearedAt, cleared_reason: "discarded", cleared_by: userId })
        .in("id", ids)
        .is("cleared_at", null);
      if (error) {
        setClearAllError(t("common.failed"));
        return;
      }
      for (const item of expiredMilk) markChillerCleared(item.id, clearedAt, "discarded");
      undo.show(expiredMilk.map(toUndo));
      setClearAllConfirm(false);
      setReload((value) => value + 1);
    } finally {
      clearAllLock.current = false;
      setClearAllPending(false);
    }
  }

  return (
    <Screen
      titleKey="chiller.title"
      ledeKey="chiller.lede"
      showLater={false}
      icon={<CareIcon name="chiller" className="h-8 w-8" />}
    >
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("chiller.title")}>
        <button
          type="button"
          aria-pressed={filter === "active"}
          onClick={() => setFilter("active")}
          className={`min-h-12 rounded-2xl text-sm font-semibold ${
            filter === "active" ? "bg-accent text-accent-foreground" : "border border-line bg-card"
          }`}
        >
          {t("home.inChiller")}
        </button>
        <button
          type="button"
          aria-pressed={filter === "cleared"}
          onClick={() => setFilter("cleared")}
          className={`min-h-12 rounded-2xl text-sm font-semibold ${
            filter === "cleared" ? "bg-accent text-accent-foreground" : "border border-line bg-card"
          }`}
        >
          {t("chiller.cleared")}
        </button>
      </div>
      {filter === "active" && expiredMilk.length > 0 ? (
        <div className="flex flex-col gap-2">
          {clearAllConfirm ? (
            <>
              <p className="text-sm text-muted">{t("chiller.clearAllConfirm")}</p>
              <button
                type="button"
                disabled={clearAllPending}
                aria-busy={clearAllPending}
                onClick={() => void clearExpired()}
                className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
              >
                {clearAllPending ? <SavingLabel label={t("common.saving")} /> : t("chiller.discarded")}
              </button>
              <button
                type="button"
                disabled={clearAllPending}
                onClick={() => setClearAllConfirm(false)}
                className="self-start text-sm font-semibold text-muted"
              >
                {t("common.back")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setClearAllError(null);
                setClearAllConfirm(true);
              }}
              className="min-h-12 rounded-2xl border border-line px-4 text-base font-semibold"
            >
              {t("chiller.clearAll")}
            </button>
          )}
          {clearAllError ? (
            <p role="alert" className="text-sm">
              {clearAllError}
            </p>
          ) : null}
        </div>
      ) : null}
      {state === "loading" && visible.length === 0 ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("chiller.loading")}
        </p>
      ) : null}
      {state === "error" && visible.length === 0 ? (
        <p className="text-sm text-muted" role="alert">
          {t("chiller.error")}
        </p>
      ) : null}
      {state !== "loading" && visible.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card px-5 py-4 text-sm leading-6">{t("chiller.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => {
            const remaining = new Date(item.expiresAt).getTime() - now;
            const expired = remaining < 0;
            const title =
              item.type === "milk"
                ? `${t("chiller.milk")}${item.volumeMl ? ` · ${item.volumeMl} ml` : ""}`
                : item.pumpName || t("chiller.parts");
            const when = expired
              ? t("home.expired")
              : t("home.timeLeft", { time: formatSpan(remaining) });
            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 rounded-3xl border bg-card px-5 py-4 ${
                  expired && filter === "active" ? "border-danger" : "border-line"
                }`}
              >
                <Link href={`/chiller/${item.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                  <CareIcon
                    name={item.type === "milk" ? "feed" : "chiller"}
                    className={`mt-0.5 h-5 w-5 shrink-0 ${expired && filter === "active" ? "text-danger" : "text-accent"}`}
                  />
                  <span className="min-w-0">
                    <p className={`text-base font-semibold ${expired && filter === "active" ? "text-danger" : ""}`}>
                      {title}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {t(`chiller.${item.location}`)}
                      {babyCount > 1 && item.type === "milk" && item.babyName ? ` · ${item.babyName}` : ""}
                    </p>
                    {item.type === "milk" && item.note ? <p className="mt-1 text-sm">{item.note}</p> : null}
                    {filter === "active" && expired ? (
                      <Badge variant="danger" className="mt-1 h-auto px-1.5 py-0 text-sm">
                        {t("home.expiredBadge")}
                      </Badge>
                    ) : (
                      <p className="mt-1 text-sm">{when}</p>
                    )}
                  </span>
                </Link>
                {filter === "active" ? (
                  <ClearChiller
                    id={item.id}
                    type={item.type}
                    onCleared={() => {
                      undo.show([toUndo(item)]);
                      setReload((value) => value + 1);
                    }}
                  />
                ) : item.clearedReason ? (
                  <p className="shrink-0 text-sm text-muted">{t(`chiller.${item.clearedReason}`)}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ChillerUndoToast
        items={undo.items}
        onDone={() => {
          undo.dismiss();
          setReload((value) => value + 1);
        }}
      />
    </Screen>
  );
}

function toUndo(item: LiveChillerItem): UndoItem {
  return { id: item.id, type: item.type, expiresAt: item.expiresAt };
}

function deviceName(item: ChillerItem, pumps: OwnedPump[]) {
  const pump = pumps.find((entry) => entry.id === item.pumpId);
  return pump ? pumpLabel(pump) : null;
}

function mergeItems(live: LiveChillerItem[] | null, device: LiveChillerItem[]) {
  const byId = new Map<string, LiveChillerItem>();
  for (const item of live ?? []) byId.set(item.id, item);
  for (const item of device) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => (left.expiresAt < right.expiresAt ? -1 : 1));
}
