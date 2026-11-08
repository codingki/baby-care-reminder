export type PumpSchedule = {
  hours: number[];
  days: number[];
  timeZone: string;
};

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function normalizeHours(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((hour): hour is number => typeof hour === "number" && hour >= 0 && hour <= 23))].sort(
    (left, right) => left - right,
  );
}

export function normalizeDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5, 6, 7];
  const days = [...new Set(value.filter((day): day is number => typeof day === "number" && day >= 1 && day <= 7))].sort(
    (left, right) => left - right,
  );
  return days;
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return asUtc - instant.getTime();
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: WEEKDAY[read("weekday")] ?? 1,
  };
}

function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, 0, 0);
  let utc = utcGuess - zoneOffsetMs(new Date(utcGuess), timeZone);
  utc = utcGuess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function addDays(year: number, month: number, day: number, offset: number) {
  const next = new Date(Date.UTC(year, month - 1, day + offset));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function isoDow(year: number, month: number, day: number) {
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

function slotsAround(schedule: PumpSchedule, instant: Date): Date[] {
  if (schedule.hours.length === 0 || schedule.days.length === 0) return [];
  let timeZone = schedule.timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(instant);
  } catch {
    timeZone = "UTC";
  }
  const local = zonedParts(instant, timeZone);
  const found: Date[] = [];
  for (let offset = -14; offset <= 14; offset += 1) {
    const date = addDays(local.year, local.month, local.day, offset);
    if (!schedule.days.includes(isoDow(date.year, date.month, date.day))) continue;
    for (const hour of schedule.hours) {
      found.push(zonedTime(date.year, date.month, date.day, hour, timeZone));
    }
  }
  return found.sort((left, right) => left.getTime() - right.getTime());
}

export function nextPumpSlot(schedule: PumpSchedule, after: Date): Date | null {
  const slots = slotsAround(schedule, after);
  return slots.find((slot) => slot.getTime() > after.getTime()) ?? null;
}

export function previousPumpSlot(schedule: PumpSchedule, at: Date): Date | null {
  const slots = slotsAround(schedule, at);
  let match: Date | null = null;
  for (const slot of slots) {
    if (slot.getTime() <= at.getTime()) match = slot;
  }
  return match;
}

export function pumpCardTimes(
  schedule: PumpSchedule,
  lastPump: string | null,
  now: number | null,
): { unset: true } | { unset: false; at: string; start: string | null } {
  if (now === null || schedule.hours.length === 0 || schedule.days.length === 0) return { unset: true };
  const moment = new Date(now);
  const previous = previousPumpSlot(schedule, moment);
  const next = nextPumpSlot(schedule, moment);
  const logged = lastPump ? new Date(lastPump).getTime() : null;
  const missed = previous !== null && (logged === null || logged < previous.getTime());
  if (missed && previous) {
    const before = previousPumpSlot(schedule, new Date(previous.getTime() - 1));
    return { unset: false, at: previous.toISOString(), start: before ? before.toISOString() : null };
  }
  if (!next) return { unset: true };
  return { unset: false, at: next.toISOString(), start: previous ? previous.toISOString() : null };
}
