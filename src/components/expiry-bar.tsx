export function expiryShare(storedAt: string, expiresAt: string, now: number) {
  const start = Date.parse(storedAt);
  const end = Date.parse(expiresAt);
  if (Number.isFinite(end) && now >= end) return { expired: true, share: 0 };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { expired: false, share: 1 };
  }
  const share = (end - now) / (end - start);
  return { expired: false, share: Math.min(1, Math.max(0, share)) };
}

export function ExpiryBar({
  storedAt,
  expiresAt,
  now,
  label,
}: {
  storedAt: string;
  expiresAt: string;
  now: number | null;
  label: string;
}) {
  const known = now !== null;
  const { expired, share } = known
    ? expiryShare(storedAt, expiresAt, now)
    : { expired: false, share: 0 };
  const width = !known ? 0 : expired ? 100 : share * 100;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(expired ? 0 : share * 100) : undefined}
    >
      <span
        className={`block h-full ${expired ? "bg-danger" : "bg-accent"} motion-reduce:transition-none motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-linear`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
