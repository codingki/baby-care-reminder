export const locales = ["en", "id"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "bcr_locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "id";
}

type RankedLanguage = { base: string; quality: number };

function rankedLanguages(acceptLanguage: string): RankedLanguage[] {
  const ranked: RankedLanguage[] = [];

  for (const part of acceptLanguage.split(",")) {
    const [tagPart, ...params] = part.trim().split(";");
    const tag = tagPart.trim().toLowerCase();
    if (!tag || tag === "*") continue;

    let quality = 1;
    for (const param of params) {
      const [key, rawValue] = param.trim().split("=");
      if (key === "q") {
        const parsed = Number(rawValue);
        quality = Number.isFinite(parsed) ? parsed : 0;
      }
    }

    if (quality <= 0) continue;
    ranked.push({ base: tag.split("-")[0] ?? tag, quality });
  }

  ranked.sort((left, right) => right.quality - left.quality);
  return ranked;
}

function localeFromLanguage(base: string): Locale | null {
  if (base === "id" || base === "in") return "id";
  if (base === "en") return "en";
  return null;
}

export function negotiateLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (!acceptLanguage) return defaultLocale;

  for (const language of rankedLanguages(acceptLanguage)) {
    const locale = localeFromLanguage(language.base);
    if (locale) return locale;
  }

  return defaultLocale;
}

export function localeCookieOptions() {
  return {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}
