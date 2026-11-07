"use client";

export function PresetChips({
  values,
  onPick,
}: {
  values: readonly number[];
  onPick: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className="min-h-9 rounded-full border border-line bg-card px-3 text-sm font-semibold"
        >
          {value}
        </button>
      ))}
    </div>
  );
}

export const MINUTE_PRESETS = [30, 60, 120, 150] as const;
export const ML_PRESETS = [30, 60, 90, 120, 150] as const;
export const OZ_PRESETS = [1, 2, 3, 4, 5] as const;

const ML_PER_OZ = 29.5735;

export function volumePresets(unit: string) {
  return unit === "oz" ? OZ_PRESETS : ML_PRESETS;
}

export function volumeToMl(amount: number, unit: string) {
  if (unit === "oz") return Math.round(amount * ML_PER_OZ);
  return Math.round(amount);
}
