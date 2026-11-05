"use client";

import { useEffect, useState } from "react";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import type { MessageKey } from "@/i18n/translate";
import { nowMs } from "@/lib/clock";

type FeedMode = "bottle" | "nursing";
type NursingSide = "left" | "right";

type NursingSession = {
  running: NursingSide | null;
  runningSince: number | null;
  elapsed: { left: number; right: number };
  startedAt: number | null;
};

const idleSession: NursingSession = {
  running: null,
  runningSince: null,
  elapsed: { left: 0, right: 0 },
  startedAt: null,
};

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  if (hours > 0) return `${hours}:${clock}`;
  return clock;
}

function formatStamp(timestamp: number, locale: Locale): string {
  return new Date(timestamp).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sideSeconds(session: NursingSession, side: NursingSide, now: number): number {
  const extra =
    session.running === side && session.runningSince
      ? Math.floor((now - session.runningSince) / 1000)
      : 0;
  return session.elapsed[side] + extra;
}

export default function FeedPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<FeedMode>("bottle");

  return (
    <Screen titleKey="feed.title" ledeKey="feed.lede" backHref="/">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("feed.title")}>
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
      {mode === "bottle" ? <BottleAmount label={t("feed.amount")} /> : <NursingTimer />}
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

function NursingTimer() {
  const { locale, t } = useI18n();
  const [session, setSession] = useState<NursingSession>(idleSession);
  const [now, setNow] = useState(nowMs);
  const [saved, setSaved] = useState<{
    side: NursingSide | "both";
    seconds: number;
    startedAt: number;
    endedAt: number;
  } | null>(null);

  useEffect(() => {
    if (!session.running) return;
    const timer = window.setInterval(() => setNow(nowMs()), 250);
    return () => window.clearInterval(timer);
  }, [session.running]);

  const left = sideSeconds(session, "left", now);
  const right = sideSeconds(session, "right", now);
  const total = left + right;

  function press(side: NursingSide) {
    const pressedAt = nowMs();
    setNow(pressedAt);
    setSaved(null);
    setSession((current) => {
      const next: NursingSession = {
        ...current,
        elapsed: { ...current.elapsed },
        startedAt: current.startedAt ?? pressedAt,
      };
      if (current.running && current.runningSince) {
        const add = Math.max(0, Math.floor((pressedAt - current.runningSince) / 1000));
        next.elapsed[current.running] += add;
      }
      if (current.running === side) {
        next.running = null;
        next.runningSince = null;
      } else {
        next.running = side;
        next.runningSince = pressedAt;
      }
      return next;
    });
  }

  function save() {
    const endedAt = nowMs();
    let leftSeconds = session.elapsed.left;
    let rightSeconds = session.elapsed.right;
    if (session.running && session.runningSince) {
      const add = Math.max(0, Math.floor((endedAt - session.runningSince) / 1000));
      if (session.running === "left") leftSeconds += add;
      else rightSeconds += add;
    }
    const seconds = leftSeconds + rightSeconds;
    if (seconds <= 0 || session.startedAt === null) return;
    const side: NursingSide | "both" =
      leftSeconds > 0 && rightSeconds > 0 ? "both" : leftSeconds > 0 ? "left" : "right";
    setSaved({ side, seconds, startedAt: session.startedAt, endedAt });
    setSession(idleSession);
    setNow(endedAt);
  }

  const sideLabel: Record<NursingSide | "both", MessageKey> = {
    left: "feed.left",
    right: "feed.right",
    both: "feed.both",
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted">{t("feed.timerHint")}</p>
      <div className="grid grid-cols-2 gap-3">
        {(["left", "right"] as const).map((side) => {
          const seconds = side === "left" ? left : right;
          const active = session.running === side;
          return (
            <button
              key={side}
              type="button"
              aria-pressed={active}
              onClick={() => press(side)}
              className={`flex min-h-28 flex-col items-center justify-center rounded-3xl px-3 ${
                active ? "bg-accent text-accent-foreground" : "border border-line bg-card"
              }`}
            >
              <span className="text-base font-semibold">{t(sideLabel[side])}</span>
              <span className="mt-2 font-mono text-2xl tabular-nums">{formatClock(seconds)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm font-semibold" role="status">
        {t("feed.total", { time: formatClock(total) })}
      </p>
      <button
        type="button"
        onClick={save}
        disabled={total <= 0}
        className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {t("feed.saveNursing")}
      </button>
      {saved ? (
        <div className="rounded-3xl border border-line bg-card px-4 py-3 text-sm leading-6">
          <p className="font-semibold">{t("feed.saved")}</p>
          <p>{t("feed.savedDetail", { side: t(sideLabel[saved.side]), time: formatClock(saved.seconds) })}</p>
          <p className="text-muted">{t("feed.started", { time: formatStamp(saved.startedAt, locale) })}</p>
          <p className="text-muted">{t("feed.ended", { time: formatStamp(saved.endedAt, locale) })}</p>
        </div>
      ) : null}
    </div>
  );
}
