// Sends due reminders, milk-expiry alerts, pump-parts wash-by alerts, and family activity pushes.
// The live cron runs every minute and calls this function only when something is due.
// A new log also calls it immediately through pg_net.
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
  notify_family_activity?: boolean;
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

const titles = { en: "Baby Care", id: "Perawatan Bayi" } as const;

function pushBody(language: "en" | "id", kind: string, name: string | null) {
  if (language === "id") {
    if (kind === "feed") return name ? `Waktunya ${name} minum susu! 🍼` : "Waktunya minum susu! 🍼";
    if (kind === "diaper") return name ? `Cek popok! ${name} mungkin perlu ganti` : "Cek popok! Mungkin perlu ganti";
    if (kind === "pump") return "Waktunya pumping, Bunda! 💪";
    if (kind === "pump_parts") return "Saatnya cuci perlengkapan pompa 🧼";
    return "ASIP hampir kedaluwarsa, pakai dulu ya";
  }
  if (kind === "feed") return name ? `Time to feed ${name}! 🍼` : "Time to feed! 🍼";
  if (kind === "diaper") return name ? `Time for a fresh diaper, ${name}!` : "Time for a fresh diaper!";
  if (kind === "pump") return "Time to pump, mama! 💪";
  if (kind === "pump_parts") return "Pump parts need a wash soon 🧼";
  return "Stored milk expires soon, use it first";
}

function pushUrl(kind: string, babyId: string | null) {
  if (kind === "milk" || kind === "pump_parts") return "/chiller";
  const log = kind === "diaper" || kind === "feed" || kind === "pump" ? kind : "feed";
  const params = new URLSearchParams({ log });
  if (babyId) params.set("baby", babyId);
  return `/?${params.toString()}`;
}

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
        .select("id, family_id, baby_id, reminder_type, audience")
        // Diaper and feed due times move when a log is saved. Pump due times follow the family schedule.
        .lte("next_due_at", nowIso)
        .eq("enabled", true)
        .is("notified_at", null)
        .limit(200),
      supabase
        .from("chiller_items")
        .select("id, family_id, baby_id")
        .eq("type", "milk")
        .lte("expires_at", soon)
        .is("notified_at", null)
        .is("cleared_at", null)
        .limit(200),
    ]);

  if (reminderError || milkError) {
    return new Response("could not read due items", { status: 500 });
  }

  const due = [
    ...(reminders ?? []).map((row) => ({
      id: row.id as string,
      familyId: row.family_id as string,
      babyId: typeof row.baby_id === "string" ? row.baby_id : null,
      kind: row.reminder_type as string,
      audience: row.audience as string,
      table: "reminders" as const,
    })),
    ...(milk ?? []).map((row) => ({
      id: row.id as string,
      familyId: row.family_id as string,
      babyId: typeof row.baby_id === "string" ? row.baby_id : null,
      kind: "milk",
      audience: "caregivers",
      table: "chiller_items" as const,
    })),
  ];

  let sent = 0;
  let held = 0;
  if (due.length > 0) {
  const familyIds = [...new Set(due.map((item) => item.familyId))];
  const { data: babyRows } = await supabase.from("babies").select("id, name, family_id").in("family_id", familyIds);
  const babyNames = new Map<string, string>();
  for (const baby of babyRows ?? []) {
    if (typeof baby.id === "string" && typeof baby.name === "string") babyNames.set(baby.id, baby.name);
  }
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
  const sentPumpIds: string[] = [];
  const sentMilkIds: string[] = [];

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
      const babyName = item.babyId ? babyNames.get(item.babyId) ?? null : null;
      const body = pushBody(language, item.kind, babyName);
      const title = titles[language];
      const url = pushUrl(item.kind, item.babyId);
      for (const device of devices) {
        try {
          await webpush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth_key },
            },
            JSON.stringify({ title, body, url }),
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
      if (item.table === "reminders" && item.kind === "pump") sentPumpIds.push(item.id);
      else if (item.table === "reminders") sentReminderIds.push(item.id);
      else sentMilkIds.push(item.id);
    } else if (waiting) {
      held += 1;
    } else if (item.table === "reminders" && item.kind === "pump") {
      sentPumpIds.push(item.id);
    } else if (item.table === "reminders") {
      sentReminderIds.push(item.id);
    } else {
      sentMilkIds.push(item.id);
    }
  }

  if (sentReminderIds.length > 0) {
    const { error } = await supabase.from("reminders").update({ notified_at: nowIso }).in("id", sentReminderIds);
    if (error) return new Response(error.message, { status: 500 });
  }
  if (sentPumpIds.length > 0) {
    const { error } = await supabase.rpc("advance_pump_reminders", { reminder_ids: sentPumpIds });
    if (error) return new Response(error.message, { status: 500 });
  }
  if (sentMilkIds.length > 0) {
    const { error } = await supabase
      .from("chiller_items")
      .update({ notified_at: nowIso })
      .in("id", sentMilkIds);
    if (error) return new Response(error.message, { status: 500 });
  }
  }

  const activities = await deliverActivities(supabase, now);
  if (activities.error) return new Response(activities.error, { status: 500 });

  return Response.json({ sent, held, activities: activities.sent });
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

type ActivityPayload = {
  actor_name?: string;
  baby_name?: string;
  occurred_at?: string;
  created_at?: string;
  amount_ml?: number | null;
  duration_seconds?: number | null;
  feed_kind?: string | null;
  diaper_kind?: string | null;
  weight_grams?: number | null;
  weighed_on?: string | null;
};

type ActivityEvent = {
  id: string;
  family_id: string;
  actor_user_id: string | null;
  baby_id: string | null;
  kind: string;
  payload: ActivityPayload;
  delivered_user_ids: string[] | null;
};

async function deliverActivities(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<{ sent: number; error?: string }> {
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { error: dropError } = await supabase
    .from("activity_events")
    .delete()
    .is("sent_at", null)
    .lt("created_at", cutoff);
  if (dropError) {
    if (dropError.code === "42P01" || dropError.code === "PGRST205") return { sent: 0 };
    return { sent: 0, error: dropError.message };
  }

  const { data, error } = await supabase
    .from("activity_events")
    .select("id, family_id, actor_user_id, baby_id, kind, payload, delivered_user_ids")
    .is("sent_at", null)
    .order("created_at")
    .limit(50);
  if (error) return { sent: 0, error: error.message };
  const events = (data ?? []) as ActivityEvent[];
  if (events.length === 0) return { sent: 0 };

  const familyIds = [...new Set(events.map((event) => event.family_id))];
  const { data: members } = await supabase
    .from("family_members")
    .select("user_id, family_id, role")
    .in("family_id", familyIds);
  const userIds = [...new Set((members ?? []).map((member) => member.user_id as string))];
  const [{ data: settings }, { data: subscriptions }] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("member_settings").select("*").in("user_id", userIds),
    userIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key").in("user_id", userIds),
  ]);
  const settingRows = (settings ?? []) as Settings[];
  const subscriptionRows = (subscriptions ?? []) as Subscription[];
  let sent = 0;

  for (const event of events) {
    const { data: claimed } = await supabase
      .from("activity_events")
      .update({ sent_at: now.toISOString() })
      .eq("id", event.id)
      .is("sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const delivered = new Set(event.delivered_user_ids ?? []);
    let waiting = false;
    const familyMembers = (members ?? []).filter((member) => member.family_id === event.family_id);
    for (const member of familyMembers) {
      const userId = member.user_id as string;
      if (userId === event.actor_user_id || delivered.has(userId)) continue;
      const prefs = settingRows.find((row) => row.user_id === userId && row.family_id === event.family_id);
      if (prefs?.notify_family_activity === false) continue;
      if (prefs && (snoozed(prefs, now) || quiet(prefs, now))) {
        waiting = true;
        continue;
      }
      const devices = subscriptionRows.filter((row) => row.user_id === userId);
      if (devices.length === 0) continue;
      const language = prefs?.language === "id" ? "id" : "en";
      const timeZone = prefs?.timezone || "UTC";
      const payload = event.payload ?? {};
      const body = activityBody(language, event.kind, payload, timeZone);
      const title = titles[language];
      const url = event.baby_id ? `/?baby=${event.baby_id}` : "/";
      const tag = `activity-${event.baby_id ?? "family"}-${event.kind}`;
      let reached = false;
      let failed = false;
      for (const device of devices) {
        try {
          await webpush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth_key },
            },
            JSON.stringify({ title, body, url, tag }),
          );
          sent += 1;
          reached = true;
        } catch (pushError) {
          const status = (pushError as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", device.id);
          } else {
            failed = true;
          }
        }
      }
      if (reached || !failed) delivered.add(userId);
      else waiting = true;
    }

    const { error: updateError } = await supabase
      .from("activity_events")
      .update({
        delivered_user_ids: [...delivered],
        sent_at: waiting ? null : now.toISOString(),
      })
      .eq("id", event.id);
    if (updateError) return { sent, error: updateError.message };
  }

  return { sent };
}

function activityBody(
  language: "en" | "id",
  kind: string,
  payload: ActivityPayload,
  timeZone: string,
): string {
  const actor = payload.actor_name?.trim() || (language === "id" ? "Seseorang" : "Someone");
  const baby = payload.baby_name?.trim() || "";
  const backdated = isBackdated(kind, payload);
  const clock = payload.occurred_at ? clockInZone(payload.occurred_at, timeZone) : "";
  const ml = typeof payload.amount_ml === "number" ? `${payload.amount_ml} ml` : "";
  const duration =
    typeof payload.duration_seconds === "number" && payload.duration_seconds > 0
      ? minuteLabel(payload.duration_seconds, language)
      : "";
  const detail = [ml, duration].filter(Boolean).join(" · ");
  const diaper = diaperWord(language, payload.diaper_kind);
  const kg = typeof payload.weight_grams === "number" ? `${kgLabel(payload.weight_grams, language)} kg` : "";

  if (language === "id") {
    if (kind === "feed" && payload.feed_kind === "breast") {
      return backdated
        ? `${actor} mencatat ${baby || "bayi"} menyusu pukul ${clock} 🍼${duration ? ` ${duration}` : ""}`
        : `${actor} baru saja menyusui ${baby || "bayi"} 🍼${duration ? ` ${duration}` : ""}`;
    }
    if (kind === "feed") {
      return backdated
        ? `${actor} mencatat ${baby || "bayi"} minum susu pukul ${clock} 🍼${ml ? ` ${ml}` : ""}`
        : `${actor} baru saja memberi ${baby || "bayi"} susu 🍼${ml ? ` ${ml}` : ""}`;
    }
    if (kind === "diaper") {
      const note = diaper ? ` (${diaper})` : "";
      return backdated
        ? `${actor} mencatat ganti popok ${baby || "bayi"} pukul ${clock}${note}`
        : `${actor} mengganti popok ${baby || "bayi"}${note}`;
    }
    if (kind === "pump") {
      return backdated
        ? `${actor} mencatat pompa ${baby || "bayi"} pukul ${clock} 💪${detail ? ` ${detail}` : ""}`
        : `${actor} baru saja memompa untuk ${baby || "bayi"} 💪${detail ? ` ${detail}` : ""}`;
    }
    if (kind === "weight") {
      const when = payload.weighed_on ? dateLabel(payload.weighed_on) : clock;
      return backdated
        ? `${actor} mencatat berat ${baby || "bayi"} untuk ${when}${kg ? ` · ${kg}` : ""}`
        : `${actor} menimbang ${baby || "bayi"}${kg ? ` · ${kg}` : ""}`;
    }
    if (kind === "pump_parts") {
      return backdated
        ? `${actor} mencatat bagian pompa di chiller pukul ${clock} 🧼`
        : `${actor} mencuci bagian pompa 🧼`;
    }
    const who = baby ? ` untuk ${baby}` : "";
    const stored = ml ? `${ml} ASIP` : "ASIP";
    return backdated
      ? `${actor} mencatat ${stored} di chiller pukul ${clock} ❄️`
      : `${actor} menyimpan ${stored}${who} di chiller ❄️`;
  }

  if (kind === "feed" && payload.feed_kind === "breast") {
    return backdated
      ? `${actor} logged nursing for ${baby || "the baby"} at ${clock} 🍼${duration ? ` ${duration}` : ""}`
      : `${actor} just nursed ${baby || "the baby"} 🍼${duration ? ` ${duration}` : ""}`;
  }
  if (kind === "feed") {
    return backdated
      ? `${actor} logged a feed for ${baby || "the baby"} at ${clock} 🍼${ml ? ` ${ml}` : ""}`
      : `${actor} just fed ${baby || "the baby"} 🍼${ml ? ` ${ml}` : ""}`;
  }
  if (kind === "diaper") {
    const note = diaper ? ` (${diaper})` : "";
    return backdated
      ? `${actor} logged a diaper change for ${baby || "the baby"} at ${clock}${note}`
      : `${actor} changed ${baby || "the baby"}'s diaper${note}`;
  }
  if (kind === "pump") {
    return backdated
      ? `${actor} logged a pump for ${baby || "the baby"} at ${clock} 💪${detail ? ` ${detail}` : ""}`
      : `${actor} just pumped for ${baby || "the baby"} 💪${detail ? ` ${detail}` : ""}`;
  }
  if (kind === "weight") {
    const when = payload.weighed_on ? dateLabel(payload.weighed_on) : clock;
    return backdated
      ? `${actor} logged ${baby || "the baby"}'s weight for ${when}${kg ? ` · ${kg}` : ""}`
      : `${actor} weighed ${baby || "the baby"}${kg ? ` · ${kg}` : ""}`;
  }
  if (kind === "pump_parts") {
    return backdated
      ? `${actor} logged pump parts in the chiller at ${clock} 🧼`
      : `${actor} washed the pump parts 🧼`;
  }
  const who = baby ? ` for ${baby}` : "";
  return backdated
    ? `${actor} logged ${ml || "milk"} in the chiller at ${clock} ❄️`
    : `${actor} stored ${ml || "milk"}${who} in the chiller ❄️`;
}

function isBackdated(kind: string, payload: ActivityPayload) {
  if (kind === "weight") {
    const weighed = payload.weighed_on?.slice(0, 10);
    const created = payload.created_at?.slice(0, 10);
    return Boolean(weighed && created && weighed < created);
  }
  if (!payload.occurred_at || !payload.created_at) return false;
  const occurred = Date.parse(payload.occurred_at);
  const created = Date.parse(payload.created_at);
  if (!Number.isFinite(occurred) || !Number.isFinite(created)) return false;
  return created - occurred > 5 * 60 * 1000;
}

function clockInZone(iso: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour}:${minute}`;
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

function dateLabel(isoDate: string) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function minuteLabel(seconds: number, language: "en" | "id") {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return language === "id" ? `${minutes} menit` : `${minutes} min`;
}

function kgLabel(grams: number, language: "en" | "id") {
  const text = (grams / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return language === "id" ? text.replace(".", ",") : text;
}

function diaperWord(language: "en" | "id", kind: string | null | undefined) {
  if (language === "id") {
    if (kind === "wet") return "pipis";
    if (kind === "dirty") return "pup";
    if (kind === "mixed") return "keduanya";
    return "";
  }
  if (kind === "wet") return "pee";
  if (kind === "dirty") return "poop";
  if (kind === "mixed") return "both";
  return "";
}
