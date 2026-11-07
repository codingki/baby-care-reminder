"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <Card className="gap-3 p-4">
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void removePump(pump.id)}
                disabled={pending !== null}
                aria-busy={pending === pump.id}
                className="min-h-11 rounded-full px-3 text-sm text-muted"
              >
                {pending === pump.id ? <SavingLabel label={t("common.saving")} /> : t("settings.removePump")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-model">
        {t("settings.brandModel")}
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger id="pump-model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.brand}>
                <SelectLabel>{group.brand}</SelectLabel>
                {group.pumps.map((pump) => (
                  <SelectItem key={pump.id} value={pump.id}>
                    {pump.model}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectItem value="custom">{t("settings.custom")}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {choice === "custom" ? (
        <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="custom-pump">
          {t("settings.customName")}
          <Input
            id="custom-pump"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            className="bg-background px-3"
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="pump-nickname">
        {t("settings.nickname")}
        <Input
          id="pump-nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          className="bg-background px-3"
        />
      </label>
      <Button type="button" onClick={() => void addPump()} disabled={pending !== null} aria-busy={pending === "add"}>
        {pending === "add" ? <SavingLabel label={t("common.saving")} /> : t("settings.addPump")}
      </Button>
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </Card>
  );
}
