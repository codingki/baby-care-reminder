"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CareIcon } from "@/components/care-icon";
import { ExpiryBar } from "@/components/expiry-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChillerUndoToast, ClearChiller, useChillerUndo, type UndoItem } from "@/components/clear-chiller";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { type LiveChillerItem } from "@/lib/chiller-live";
import { clearChillerItem, useLiveChiller } from "@/lib/chiller-cache";
import { useScope } from "@/lib/care-queries";
import { EditEntryDialog, type ChillerEdit } from "@/components/edit-entry";
import { markChillerCleared, pumpLabel, type ChillerItem, type OwnedPump } from "@/lib/device-care";
import { formatSpan, nowMs } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/client";

export default function ChillerPage() {
  const { t } = useI18n();
  const device = useCareStore();
  const [now, setNow] = useState(nowMs);
  const scope = useScope();
  const queryClient = useQueryClient();
  const chillerQuery = useLiveChiller(scope.data?.familyId);
  const [editing, setEditing] = useState<ChillerEdit | null>(null);
  const live = chillerQuery.data?.items ?? null;
  const babyCount = chillerQuery.data?.babyCount ?? 0;
  const state = chillerQuery.data ? "ready" : chillerQuery.isPending ? "loading" : scope.data ? "error" : "loading";
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

  const reloadChiller = () => {
    void queryClient.invalidateQueries({ queryKey: ["chiller", scope.data?.familyId] });
  };

  const deviceItems: LiveChillerItem[] = device.items.map((item) => ({
    ...item,
    pumpName: deviceName(item, device.pumps),
    babyId: null,
    babyName: null,
    clearedAt: item.clearedAt ?? null,
    clearedReason: item.clearedReason ?? null,
  }));
  const items = live ? live : deviceItems;
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
      for (const item of expiredMilk) {
        markChillerCleared(item.id, clearedAt, "discarded");
        clearChillerItem(queryClient, scope.data?.familyId, item.id, clearedAt, "discarded");
      }
      undo.show(expiredMilk.map(toUndo));
      setClearAllConfirm(false);
      reloadChiller();
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
      <ToggleGroup
        type="single"
        value={filter}
        spacing={2}
        className="grid w-full grid-cols-2 gap-2"
        aria-label={t("chiller.title")}
        onValueChange={(next) => {
          if (next === "active" || next === "cleared") setFilter(next);
        }}
      >
        <ToggleGroupItem value="active" size="lg" className="w-full">
          {t("home.inChiller")}
        </ToggleGroupItem>
        <ToggleGroupItem value="cleared" size="lg" className="w-full">
          {t("chiller.cleared")}
        </ToggleGroupItem>
      </ToggleGroup>
      {filter === "active" && expiredMilk.length > 0 ? (
        <div className="flex flex-col gap-2">
          {clearAllConfirm ? (
            <>
              <p className="text-sm text-muted">{t("chiller.clearAllConfirm")}</p>
              <Button type="button" disabled={clearAllPending} aria-busy={clearAllPending} onClick={() => void clearExpired()}>
                {clearAllPending ? <SavingLabel label={t("common.saving")} /> : t("chiller.discarded")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={clearAllPending}
                onClick={() => setClearAllConfirm(false)}
                className="h-auto min-h-0 self-start px-0 text-sm text-muted"
              >
                {t("common.back")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setClearAllError(null);
                setClearAllConfirm(true);
              }}
            >
              {t("chiller.clearAll")}
            </Button>
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
        <Card className="px-5 py-4 text-sm leading-6">{t("chiller.empty")}</Card>
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
              <li key={item.id}>
                <Card
                  className={`relative flex-row items-start gap-3 overflow-hidden px-5 py-4 ${
                    expired && filter === "active" ? "border-danger" : ""
                  }`}
                >
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      id: item.id,
                      type: item.type,
                      location: item.location,
                      storedAt: item.storedAt,
                      volumeMl: item.volumeMl,
                      note: item.note ?? null,
                    })
                  }
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
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
                </button>
                {filter === "active" ? (
                  <ClearChiller
                    id={item.id}
                    type={item.type}
                    familyId={scope.data?.familyId ?? null}
                    onCleared={() => {
                      undo.show([toUndo(item)]);
                      reloadChiller();
                    }}
                  />
                ) : item.clearedReason ? (
                  <p className="shrink-0 text-sm text-muted">{t(`chiller.${item.clearedReason}`)}</p>
                ) : null}
                {filter === "active" ? (
                  <ExpiryBar
                    storedAt={item.storedAt}
                    expiresAt={item.expiresAt}
                    now={now}
                    label={t("chiller.expiryBar")}
                  />
                ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <EditEntryDialog
        log={null}
        chiller={editing}
        familyId={scope.data?.familyId ?? null}
        washByHours={24}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          reloadChiller();
        }}
      />
      <ChillerUndoToast
        items={undo.items}
        onDone={() => {
          undo.dismiss();
          reloadChiller();
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
