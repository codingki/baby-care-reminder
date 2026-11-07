"use client";

import { useEffect, useRef, useState } from "react";
import { CareIcon, SectionHeading } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

type InstallPrompt = Event & { prompt: () => Promise<void> };

type SettingsRow = {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  snooze_until: string | null;
  snooze_minutes: number;
};

export function ReminderSettings() {
  const { locale, t } = useI18n();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [snoozeUntil, setSnoozeUntil] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  const [snoozeMinutes, setSnoozeMinutes] = useState(15);
  const [note, setNote] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [pending, setPending] = useState<"push" | "quiet" | "snooze" | "clear" | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) return;
      setFamilyId(context.familyId);
      setUserId(context.userId);
      const supabase = createClient();
      const { data } = await supabase
        .from("member_settings")
        .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end, snooze_until, snooze_minutes")
        .eq("user_id", context.userId)
        .eq("family_id", context.familyId)
        .maybeSingle();
      const row = data as SettingsRow | null;
      if (!row) return;
      setEnabled(row.quiet_hours_enabled);
      setStart(row.quiet_hours_start?.slice(0, 5) ?? "22:00");
      setEnd(row.quiet_hours_end?.slice(0, 5) ?? "07:00");
      setSnoozeUntil(row.snooze_until);
      setSnoozed(Boolean(row.snooze_until && new Date(row.snooze_until).getTime() > Date.now()));
      setSnoozeMinutes(row.snooze_minutes || 15);
    })();
  }, []);

  async function run(action: "push" | "quiet" | "snooze" | "clear", task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(action);
    try {
      await task();
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function enableNotifications() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setNote(t("settings.vapidMissing"));
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setNote(t("settings.notificationsUnsupported"));
      return;
    }
    if (isIos() && !isStandalone()) {
      setNote(t("settings.iosBody"));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setNote(t("settings.notificationsDenied"));
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth || !userId) {
      setNote(t("common.failed"));
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        family_id: familyId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
    setNote(error ? t("common.failed") : t("settings.notificationsOn"));
  }

  async function saveQuietHours() {
    if (!userId || !familyId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("member_settings")
      .update({
        quiet_hours_enabled: enabled,
        quiet_hours_start: start,
        quiet_hours_end: end,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      })
      .eq("user_id", userId)
      .eq("family_id", familyId);
    setNote(error ? t("common.failed") : t("common.saved"));
  }

  async function snooze() {
    if (!userId || !familyId) return;
    const until = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
    const supabase = createClient();
    const { error } = await supabase
      .from("member_settings")
      .update({ snooze_until: until })
      .eq("user_id", userId)
      .eq("family_id", familyId);
    if (error) {
      setNote(t("common.failed"));
      return;
    }
    setSnoozeUntil(until);
    setSnoozed(true);
  }

  async function clearSnooze() {
    if (!userId || !familyId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("member_settings")
      .update({ snooze_until: null })
      .eq("user_id", userId)
      .eq("family_id", familyId);
    if (error) {
      setNote(t("common.failed"));
      return;
    }
    setSnoozeUntil(null);
    setSnoozed(false);
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4">
      <SectionHeading icon="bell">{t("settings.notifications")}</SectionHeading>
      <p className="text-sm leading-6 text-muted">{t("settings.notificationsHint")}</p>
      <ol className="flex flex-col gap-2 text-sm leading-6">
        <li>{t("settings.installHint")}</li>
        <li>{t("settings.iosShare")}</li>
        <li>{t("settings.iosBody")}</li>
      </ol>
      {installPrompt ? (
        <Button type="button" variant="outline" onClick={() => void installPrompt.prompt()}>
          {t("settings.install")}
        </Button>
      ) : null}
      <Button
        type="button"
        onClick={() => void run("push", enableNotifications)}
        disabled={pending !== null}
        aria-busy={pending === "push"}
      >
        {pending === "push" ? <SavingLabel label={t("common.saving")} /> : t("settings.enableNotifications")}
      </Button>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CareIcon name="clock" className="h-4 w-4 text-accent" />
          {t("settings.quietHours")}
        </h3>
        <label className="flex min-h-12 items-center justify-between gap-3 text-base font-semibold">
          <span>{t("settings.quietHours")}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} className="h-6 w-11" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="quiet-start">
            {t("settings.quietStart")}
            <Input
              id="quiet-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="bg-background px-3"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="quiet-end">
            {t("settings.quietEnd")}
            <Input
              id="quiet-end"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="bg-background px-3"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void run("quiet", saveQuietHours)}
          disabled={pending !== null}
          aria-busy={pending === "quiet"}
        >
          {pending === "quiet" ? <SavingLabel label={t("common.saving")} /> : t("settings.quietSave")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CareIcon name="timer" className="h-4 w-4 text-accent" />
          {t("settings.snooze")}
        </h3>
        {snoozed && snoozeUntil ? (
          <p className="text-sm">{t("settings.snoozed", { time: clock(snoozeUntil, locale) })}</p>
        ) : (
          <p className="text-sm text-muted">{t("settings.snoozeDetail")}</p>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => void run("snooze", snooze)}
          disabled={pending !== null}
          aria-busy={pending === "snooze"}
        >
          {pending === "snooze" ? (
            <SavingLabel label={t("common.saving")} />
          ) : (
            t("settings.snoozeNow", { minutes: String(snoozeMinutes) })
          )}
        </Button>
        {snoozed ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void run("clear", clearSnooze)}
            disabled={pending !== null}
            aria-busy={pending === "clear"}
          >
            {pending === "clear" ? <SavingLabel label={t("common.saving")} /> : t("settings.clearSnooze")}
          </Button>
        ) : null}
      </div>
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </section>
  );
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function clock(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(locale === "id" ? "id-ID" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}
