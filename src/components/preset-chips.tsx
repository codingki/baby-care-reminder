"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function PresetChips({
  values,
  onPick,
}: {
  values: readonly number[];
  onPick: (value: number) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      spacing={2}
      className="flex w-auto flex-wrap justify-start gap-2"
      onValueChange={(next) => {
        if (next) onPick(Number(next));
      }}
    >
      {values.map((value) => (
        <ToggleGroupItem key={value} value={String(value)} onClick={() => onPick(value)}>
          {value}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
