const keyFor = (familyId: string) => `bcr-selected-baby:${familyId}`;

export function chooseBaby(familyId: string, ids: string[]): string | null {
  if (ids.length === 0) return null;
  if (typeof window === "undefined") return ids[0] ?? null;
  const stored = window.localStorage.getItem(keyFor(familyId));
  if (stored && ids.includes(stored)) return stored;
  return ids[0] ?? null;
}

export function rememberBaby(familyId: string, babyId: string) {
  window.localStorage.setItem(keyFor(familyId), babyId);
}
