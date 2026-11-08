import type { Locale } from "@/i18n/locales";

export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, "");
  if (!text) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized = text;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    if ((text.match(/,/g) ?? []).length > 1) return null;
    normalized = text.replace(",", ".");
  }
  normalized = normalized.replace(/\.$/, "");
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatDecimal(value: number, locale: Locale): string {
  const text = String(value);
  return locale === "id" ? text.replace(".", ",") : text;
}
