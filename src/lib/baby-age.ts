export type BabyAge = {
  unit: "day" | "month" | "year";
  count: number;
};

export function babyAge(birthDate: string, now = new Date()): BabyAge | null {
  const day = birthDate.slice(0, 10);
  const birth = new Date(`${day}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;

  if (months >= 24) {
    return { unit: "year", count: Math.floor(months / 12) };
  }
  if (months >= 1) {
    return { unit: "month", count: months };
  }

  const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86_400_000));
  return { unit: "day", count: days };
}
