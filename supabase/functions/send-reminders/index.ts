// Sends due reminders, milk-expiry alerts, and pump-parts wash-by alerts.
// Schedule this function every 5 minutes in the Supabase dashboard.
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the edge runtime.
// Invoke with Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> or Bearer <CRON_SECRET>.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Settings = {
  user_id: string;
  family_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  language: string;
  snooze_until: string | null;
  alert_diaper?: boolean;
  alert_feed?: boolean;
  alert_pump?: boolean;
  alert_milk?: boolean;
  alert_parts?: boolean;
};

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

const copy = {
  en: {
    title: "Baby Care",
    diaper: "Diaper is due",
    feed: "Feed is due",
    pump: "Pump is due",
    pump_parts: "Wash pump parts soon",
    milk: "Milk in the chiller is expiring",
  },
  id: {
    title: "Perawatan Bayi",
    diaper: "Waktunya ganti popok",
    feed: "Waktunya minum",
    pump: "Waktunya pompa",
    pump_parts: "Bagian pompa perlu dicuci",
    milk: "ASI di chiller akan kedaluwarsa",
  },
} as const;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const auth = request.headers.get("Authorization") ?? "";
  const allowed =
    (serviceKey.length > 0 && auth === `Bearer ${serviceKey}`) ||
    (cronSecret.length > 0 && auth === `Bearer ${cronSecret}`);
  if (!allowed) return new Response("unauthorized", { status: 401 });

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:reminders@localhost";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!publicKey || !privateKey || !supabaseUrl || !serviceKey) {
    return new Response("missing push configuration", { status: 500 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const supabase = createClient(supabaseUrl, serviceKey);
  const now = new Date();
  const nowIso = now.toISOString();
  const soon = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  const [{ data: reminders, error: reminderError }, { data: milk, error: milkError }] =
    await Promise.all([
      supabase
        .from("reminders")
        .select("id, family_id, reminder_type, audience")
        .lte("next_due_at", nowIso)
        .eq("enabled", true)
        .is("notified_at", null)
        .limit(200),
      supabase
        .from("chiller_items")
        .select("id, family_id")
        .eq("type", "milk")
        .lte("expires_at", soon)
        .is("notified_at", null)
        .limit(200),
    ]);

  if (reminderError || milkError) {
    return new Response("could not read due items", { status: 500 });
  }

  const due = [
    ...(reminders ?? []).map((row) => ({
      id: row.id as string,
      familyId: row.family_id as string,
      kind: row.reminder_type as string,
      audience: row.audience as string,
      table: "reminders" as const,
    })),
    ...(milk ?? []).map((row) => ({
      id: row.id as string,
      familyId: row.family_id as string,
      kind: "milk",
      audience: "caregivers",
      table: "chiller_items" as const,
    })),
  ];

  if (due.length === 0) {
    return Response.json({ sent: 0, held: 0 });
  }

  const familyIds = [...new Set(due.map((item) => item.familyId))];
  const { data: members } = await supabase
    .from("family_members")
    .select("user_id, family_id, role")
    .in("family_id", familyIds);
  const userIds = [...new Set((members ?? []).map((member) => member.user_id as string))];
  const [{ data: settings }, { data: subscriptions }] = await Promise.all([
    supabase.from("member_settings").select("*").in("user_id", userIds),
    supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", userIds),
  ]);

  const settingRows = (settings ?? []) as Settings[];
  const subscriptionRows = (subscriptions ?? []) as Subscription[];
  const sentReminderIds: string[] = [];
  const sentMilkIds: string[] = [];
  let sent = 0;
  let held = 0;

  for (const item of due) {
    const recipients = (members ?? []).filter((member) => {
      if (member.family_id !== item.familyId) return false;
      if (item.audience === "caregivers" && member.role === "viewer") return false;
      return true;
    });
    let delivered = false;
    let waiting = false;

    for (const member of recipients) {
      const prefs = settingRows.find(
        (row) => row.user_id === member.user_id && row.family_id === item.familyId,
      );
      if (prefs && (snoozed(prefs, now) || quiet(prefs, now) || !wants(prefs, item.kind))) {
        waiting = true;
        continue;
      }
      const devices = subscriptionRows.filter((row) => row.user_id === member.user_id);
      const language = prefs?.language === "id" ? "id" : "en";
      const text = copy[language];
      const body = text[item.kind as keyof typeof text] ?? text.feed;
      for (const device of devices) {
        try {
          await webpush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth_key },
            },
            JSON.stringify({ title: text.title, body, url: item.kind === "milk" ? "/chiller" : "/" }),
          );
          sent += 1;
          delivered = true;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", device.id);
          }
        }
      }
    }

    if (delivered) {
      if (item.table === "reminders") sentReminderIds.push(item.id);
      else sentMilkIds.push(item.id);
    } else if (waiting) {
      held += 1;
    } else if (item.table === "reminders") {
      sentReminderIds.push(item.id);
    } else {
      sentMilkIds.push(item.id);
    }
  }

  if (sentReminderIds.length > 0) {
    await supabase.from("reminders").update({ notified_at: nowIso }).in("id", sentReminderIds);
  }
  if (sentMilkIds.length > 0) {
    await supabase.from("chiller_items").update({ notified_at: nowIso }).in("id", sentMilkIds);
  }

  return Response.json({ sent, held });
});

function wants(settings: Settings, kind: string) {
  const flag =
    kind === "diaper"
      ? settings.alert_diaper
      : kind === "feed"
        ? settings.alert_feed
        : kind === "pump"
          ? settings.alert_pump
          : kind === "pump_parts"
            ? settings.alert_parts
            : kind === "milk"
              ? settings.alert_milk
              : true;
  return flag !== false;
}

function snoozed(settings: Settings, now: Date) {
  return Boolean(settings.snooze_until && new Date(settings.snooze_until).getTime() > now.getTime());
}

function quiet(settings: Settings, now: Date) {
  if (!settings.quiet_hours_enabled || !settings.quiet_hours_start || !settings.quiet_hours_end) {
    return false;
  }
  const current = minutesInZone(now, settings.timezone || "UTC");
  const start = clockMinutes(settings.quiet_hours_start);
  const end = clockMinutes(settings.quiet_hours_end);
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function minutesInZone(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function clockMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":");
  return Number(hour) * 60 + Number(minute);
}
