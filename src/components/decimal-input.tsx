"use client";

import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/locales";
import { formatDecimal, parseDecimal } from "@/lib/decimal";

export function DecimalInput({
  locale,
  value,
  onValueChange,
  onBlur,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type" | "inputMode" | "value" | "onChange"> & {
  locale: Locale;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onBlur={(event) => {
        const parsed = parseDecimal(event.target.value);
        if (parsed !== null) onValueChange(formatDecimal(parsed, locale));
        onBlur?.(event);
      }}
    />
  );
}
