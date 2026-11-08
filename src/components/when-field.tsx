"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/provider";

const SKEW_MS = 2 * 60 * 1000;

export function clampWhen(date: Date) {
  const latest = Date.now() + SKEW_MS;
  if (date.getTime() > latest) return new Date();
  return date;
}

export function toWhenInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function useWhen(initial?: string | null) {
  const [when, setWhen] = useState(() => clampWhen(initial ? new Date(initial) : new Date()));
  return {
    when,
    setWhen: (next: Date) => setWhen(clampWhen(next)),
  };
}

export function WhenField({ when, onChange }: { when: Date; onChange: (next: Date) => void }) {
  const { t } = useI18n();
  const picks = [
    { label: t("when.now"), minutes: 0 },
    { label: t("when.ago15"), minutes: 15 },
    { label: t("when.ago30"), minutes: 30 },
    { label: t("when.ago60"), minutes: 60 },
  ];

  return (
    <div className="mt-6 flex flex-col gap-2">
      <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="log-when">
        {t("when.label")}
        <Input
          id="log-when"
          type="datetime-local"
          value={toWhenInput(when)}
          max={toWhenInput(new Date())}
          onChange={(event) => {
            const next = new Date(event.target.value);
            if (!Number.isNaN(next.getTime())) onChange(clampWhen(next));
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {picks.map((pick) => (
          <Button
            key={pick.minutes}
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => onChange(new Date(Date.now() - pick.minutes * 60 * 1000))}
          >
            {pick.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
