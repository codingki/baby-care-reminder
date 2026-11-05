export type FeedingGuideline = {
  age_min_days: number;
  age_max_days: number | null;
  weight_min_grams: number;
  weight_max_grams: number | null;
  suggested_ml: number;
  interval_minutes: number;
};

export function ageInDays(birthDate: string, now = new Date()): number {
  const start = new Date(`${birthDate}T00:00:00`);
  const ms = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function matchGuideline(
  guidelines: FeedingGuideline[],
  birthDate: string,
  weightGrams: number | null,
): FeedingGuideline | null {
  if (weightGrams === null) return null;
  const age = ageInDays(birthDate);
  const matches = guidelines.filter((row) => {
    const ageOk = age >= row.age_min_days && (row.age_max_days === null || age <= row.age_max_days);
    const weightOk =
      weightGrams >= row.weight_min_grams &&
      (row.weight_max_grams === null || weightGrams <= row.weight_max_grams);
    return ageOk && weightOk;
  });
  matches.sort((left, right) => right.age_min_days - left.age_min_days);
  return matches[0] ?? null;
}
