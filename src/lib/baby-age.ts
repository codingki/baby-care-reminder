export type AgeParts = {
  months: number;
  weeks: number;
  days: number;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarMonths(birth: Date, months: number) {
  const day = birth.getDate();
  const shifted = new Date(birth.getFullYear(), birth.getMonth() + months, 1);
  const last = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, last));
  return shifted;
}

export function babyAgeParts(birthDate: string, now = new Date()): AgeParts | null {
  const birth = startOfDay(new Date(`${birthDate.slice(0, 10)}T00:00:00`));
  if (Number.isNaN(birth.getTime())) return null;
  const today = startOfDay(now);
  if (today.getTime() < birth.getTime()) return { months: 0, weeks: 0, days: 0 };

  let months =
    (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) months = 0;

  const anchor = addCalendarMonths(birth, months);
  let leftover = Math.round((today.getTime() - anchor.getTime()) / 86_400_000);
  if (leftover < 0) leftover = 0;

  return {
    months,
    weeks: Math.floor(leftover / 7),
    days: leftover % 7,
  };
}

type AgeKey =
  | "home.monthOne"
  | "home.monthMany"
  | "home.weekOne"
  | "home.weekMany"
  | "home.dayOne"
  | "home.dayMany"
  | "home.ageOld";

export function formatBabyAge(
  birthDate: string,
  locale: "en" | "id",
  t: (key: AgeKey, vars?: Record<string, string>) => string,
): string {
  const age = babyAgeParts(birthDate);
  if (!age) return "";
  const parts: string[] = [];
  if (age.months === 1) parts.push(t("home.monthOne"));
  else if (age.months > 1) parts.push(t("home.monthMany", { count: String(age.months) }));
  if (age.weeks === 1) parts.push(t("home.weekOne"));
  else if (age.weeks > 1) parts.push(t("home.weekMany", { count: String(age.weeks) }));
  if (age.days === 1) parts.push(t("home.dayOne"));
  else if (age.days > 1) parts.push(t("home.dayMany", { count: String(age.days) }));
  if (parts.length === 0) parts.push(t("home.dayMany", { count: "0" }));
  return t("home.ageOld", { age: joinAgeParts(parts, locale) });
}

export function joinAgeParts(parts: readonly string[], language: "en" | "id"): string {
  if (parts.length === 0) return "";
  if (language === "id") return parts.join(", ");
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
