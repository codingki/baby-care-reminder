export function nowMs(): number {
  return Date.now();
}

export function formatSpan(ms: number): string {
  const minutesTotal = Math.max(1, Math.round(Math.abs(ms) / 60000));
  const days = Math.floor(minutesTotal / 1440);
  const hours = Math.floor((minutesTotal % 1440) / 60);
  const minutes = minutesTotal % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push("1m");

  return parts.slice(0, 2).join(" ");
}
