import type { ChillerLocation } from "@/lib/device-care";

/** CDC pumped-milk storage times, in hours. Leftover milk is 2 hours. */
export const MILK_STORAGE_HOURS: Record<ChillerLocation, number> = {
  room: 4,
  fridge: 24 * 4,
  freezer: 24 * 182,
  cooler: 24,
  thawed: 24,
  leftover: 2,
};

export function milkExpiresAt(storedAt: Date, location: ChillerLocation): Date {
  return new Date(storedAt.getTime() + MILK_STORAGE_HOURS[location] * 60 * 60 * 1000);
}
