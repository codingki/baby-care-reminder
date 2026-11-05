"use client";

import { useEffect, useState } from "react";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { nowMs } from "@/lib/clock";

type FeedMode = "bottle" | "nursing";

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function FeedPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<FeedMode>("bottle");

  return (
    <Screen titleKey="feed.title" ledeKey="feed.lede" backHref="/" showLater={false}>
      <div className="grid grid-cols-2 gap-2">
        {(["bottle", "nursing"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
            className={`min-h-12 rounded-2xl px-3 text-sm font-semibold ${
              mode === option ? "bg-accent text-accent-foreground" : "border border-line bg-card"
            }`}
          >
            {t(`feed.${option}`)}
          </button>
        ))}
      </div>
      {mode === "bottle" ? <BottleAmount label={t("feed.amount")} /> : <NursingTimer startLabel={t("feed.start")} stopLabel={t("feed.stop")} />}
    </Screen>
  );
}

function BottleAmount({ label }: { label: string }) {
  const [amount, setAmount] = useState("");

  return (
    <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="feed-ml">
      {label}
      <input
        id="feed-ml"
        type="number"
        inputMode="decimal"
        min={1}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
      />
    </label>
  );
}

function NursingTimer({ startLabel, stopLabel }: { startLabel: string; stopLabel: string }) {
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [savedSeconds, setSavedSeconds] = useState(0);
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    if (runningSince === null) return;
    const timer = window.setInterval(() => setNow(nowMs()), 250);
    return () => window.clearInterval(timer);
  }, [runningSince]);

  const elapsed =
    runningSince === null ? savedSeconds : Math.floor((now - runningSince) / 1000);

  function toggle() {
    const pressedAt = nowMs();
    if (runningSince === null) {
      setSavedSeconds(0);
      setRunningSince(pressedAt);
      setNow(pressedAt);
      return;
    }
    const seconds = Math.floor((pressedAt - runningSince) / 1000);
    setRunningSince(null);
    setSavedSeconds(seconds > 0 ? seconds : 0);
    setNow(pressedAt);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-mono text-5xl tabular-nums" role="timer">
        {formatClock(elapsed)}
      </p>
      <button
        type="button"
        aria-pressed={runningSince !== null}
        onClick={toggle}
        className="min-h-14 w-full rounded-3xl bg-accent px-4 text-base font-semibold text-accent-foreground"
      >
        {runningSince === null ? startLabel : stopLabel}
      </button>
    </div>
  );
}
