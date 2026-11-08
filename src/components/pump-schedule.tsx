"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SectionHeading } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";
import { deviceTimeZone } from "@/lib/device-timezone";
import { loadFamilyContext } from "@/lib/family-context";
import { normalizeDays, normalizeHours } from "@/lib/pump-schedule";
import { createClient } from "@/lib/supabase/client";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAYS: { day: number; key: MessageKey }[] = [
  { day: 1, key: "settings.dayMon" },
  { day: 2, key: "settings.dayTue" },
  { day: 3, key: "settings.dayWed" },
  { day: 4, key: "settings.dayThu" },
  { day: 5, key: "settings.dayFri" },
  { day: 6, key: "settings.daySat" },
  { day: 7, key: "settings.daySun" },
];

function clock(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function PumpSchedule() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<number[]>([]);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) {
        setReady(true);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("families")
        .select("pump_hours, pump_days")
        .eq("id", context.familyId)
        .maybeSingle();
      if (data) {
        setHours(normalizeHours(data.pump_hours));
        setDays(normalizeDays(data.pump_days));
      }
      setReady(true);
    })();
  }, []);

  function toggleHour(hour: number, on: boolean) {
    setHours((current) => {
      const next = on ? [...current, hour] : current.filter((item) => item !== hour);
      return normalizeHours(next);
    });
  }

  function toggleDay(day: number, on: boolean) {
    setDays((current) => {
      const next = on ? [...current, day] : current.filter((item) => item !== day);
      return normalizeDays(next);
    });
  }

  async function save() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setNote(null);
    try {
      const context = await loadFamilyContext();
      if (!context) {
        setNote(t("common.failed"));
        return;
      }
      const supabase = createClient();
      const { data: settings } = await supabase
        .from("member_settings")
        .select("timezone")
        .eq("user_id", context.userId)
        .eq("family_id", context.familyId)
        .maybeSingle();
      const zone = typeof settings?.timezone === "string" && settings.timezone ? settings.timezone : deviceTimeZone();
      const { error } = await supabase
        .from("families")
        .update({
          pump_hours: hours,
          pump_days: days,
          pump_schedule_timezone: zone,
        })
        .eq("id", context.familyId);
      if (error) {
        setNote(error.message || t("common.failed"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      setNote(t("common.saved"));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <SectionHeading icon="pump">{t("settings.pumpSchedule")}</SectionHeading>
      <p className="text-sm leading-6 text-muted">{t("settings.pumpScheduleHint")}</p>
      {ready ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{t("settings.pumpHours")}</p>
            <div className="grid grid-cols-4 gap-2">
              {HOURS.map((hour) => (
                <Toggle
                  key={hour}
                  pressed={hours.includes(hour)}
                  onPressedChange={(on) => toggleHour(hour, on)}
                  className="w-full px-0"
                  aria-label={clock(hour)}
                >
                  {clock(hour)}
                </Toggle>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{t("settings.pumpDays")}</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((item) => (
                <Toggle
                  key={item.day}
                  pressed={days.includes(item.day)}
                  onPressedChange={(on) => toggleDay(item.day, on)}
                  aria-label={t(item.key)}
                >
                  {t(item.key)}
                </Toggle>
              ))}
            </div>
          </div>
          <Button type="button" onClick={() => void save()} disabled={pending} aria-busy={pending}>
            {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </Button>
        </>
      ) : null}
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </Card>
  );
}
