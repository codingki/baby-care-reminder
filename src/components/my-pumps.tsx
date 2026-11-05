"use client";

import { useState } from "react";
import { addOwnedPump, pumpLabel, removeOwnedPump } from "@/lib/device-care";
import { catalogByBrand } from "@/lib/pump-catalog";
import { useI18n } from "@/i18n/provider";
import { useCareStore } from "@/components/use-care-store";

export function MyPumps() {
  const { t } = useI18n();
  const { pumps } = useCareStore();
  const [choice, setChoice] = useState(catalogByBrand()[0]?.pumps[0]?.id ?? "custom");
  const [customName, setCustomName] = useState("");
  const [nickname, setNickname] = useState("");
  const groups = catalogByBrand();

  function addPump() {
    const created = addOwnedPump({
      catalogId: choice === "custom" ? null : choice,
      customName,
      nickname,
    });
    if (!created) return;
    setCustomName("");
    setNickname("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold">{t("settings.myPumps")}</h2>
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
                onClick={() => removeOwnedPump(pump.id)}
                className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted"
              >
                {t("settings.removePump")}
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
        onClick={addPump}
        className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground"
      >
        {t("settings.addPump")}
      </button>
    </section>
  );
}
