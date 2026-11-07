/** Minutes between feeds when babies.suggested_interval_minutes is null. */
export const DEFAULT_FEED_INTERVAL_MINUTES = 120;

/** Pump reminders stay on a 3 hour cadence. Diapers use this when their column is null. */
export const DEFAULT_CARE_INTERVAL_MINUTES = 180;

export const DEFAULT_DIAPER_INTERVAL_MINUTES = 180;

export function feedIntervalMinutes(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return DEFAULT_FEED_INTERVAL_MINUTES;
}

export function diaperIntervalMinutes(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return DEFAULT_DIAPER_INTERVAL_MINUTES;
}
