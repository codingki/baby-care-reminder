"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { useCareStore } from "@/components/use-care-store";
import { useI18n } from "@/i18n/provider";
import { addOwnedPump, getCareState, pumpLabel, removeOwnedPump, replacePumps } from "@/lib/device-care";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnedPump, loadRemotePumps, persistOwnedPump } from "@/lib/family-pumps";
import { readQueue } from "@/lib/offline-queue";
import { catalogByBrand } from "@/lib/pump-catalog";

export function MyPumps() {
  const { t } = useI18n();
  const { pumps } = useCareStore();
  const [choice, setChoice] = useState(catalogByBrand()[0]?.pumps[0]?.id ?? "custom");
  const [customName, setCustomName] = useState("");
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState<"add" | string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const lock = useRef(false);
  const groups = catalogByBrand();

  useEffect(() => {
    void loadRemotePumps().then((remote) => {
      if (!remote) return;
      const pending = new Set(
        readQueue()
          .filter((item) => item.kind === "pump")
          .map((item) => String(item.row.id)),
      );
      const localPending = getCareState().pumps.filter((pump) => pending.has(pump.id));
      const ids = new Set(remote.map((pump) => pump.id));
      replacePumps([...localPending.filter((pump) => !ids.has(pump.id)), ...remote]);
    });
  }, []);

  async function addPump() {
    if (lock.current) return;
    lock.current = true;
    setPending("add");
    setNote(null);
    const created = addOwnedPump({
      catalogId: choice === "custom" ? null : choice,
      customName,
      nickname,
    });
    if (!created) {
      lock.current = false;
      setPending(null);
      return;
    }
    try {
      const result = await persistOwnedPump(created);
      if (result === "error") {
        removeOwnedPump(created.id);
        setNote(t("common.failed"));
        return;
      }
      setCustomName("");
      setNickname("");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function removePump(id: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(id);
    setNote(null);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const supabase = createClient();
        const { error } = await supabase.from("family_pumps").delete().eq("id", id);
        if (error) {
          setNote(t("common.failed"));
          return;
        }
      }
      removeOwnedPump(id);
      await deleteOwnedPump(id);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <SectionHeading icon="pump">{t("settings.myPumps")}</SectionHeading>
      <p className="text-sm leading-6 text-muted">{t("settings.myPumpsHint")}</p>
      {pumps.length === 0 ? (
        <p className="text-sm text-muted">{t("settings.noPumps")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pumps.map((pump) => (
            <li
              key={pump.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-background px-3 py-2"
            >
              <span className="text-sm font-medium">{pumpLabel(pump)}</span>
              <button
                type="button"
                onClick={() => void removePump(pump.id)}
                disabled={pending !== null}
                aria-busy={pending === pump.id}
                className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted disabled:opacity-50"
              >
                {pending === pump.id ? <SavingLabel label={t("common.saving")} /> : t("settings.removePump")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-model">
        {t("settings.brandModel")}
        <select
          id="pump-model"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
        >
          {groups.map((group) => (
            <optgroup key={group.brand} label={group.brand}>
              {group.pumps.map((pump) => (
                <option key={pump.id} value={pump.id}>
                  {pump.model}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="custom">{t("settings.custom")}</option>
        </select>
      </label>
      {choice === "custom" ? (
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="custom-pump">
          {t("settings.customName")}
          <input
            id="custom-pump"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-nickname">
        {t("settings.nickname")}
        <input
          id="pump-nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
        />
      </label>
      <button
        type="button"
        onClick={() => void addPump()}
        disabled={pending !== null}
        aria-busy={pending === "add"}
        className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {pending === "add" ? <SavingLabel label={t("common.saving")} /> : t("settings.addPump")}
      </button>
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </section>
  );
}
