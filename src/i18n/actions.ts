"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeCookieOptions, type Locale } from "@/i18n/locales";

export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, localeCookieOptions());
}
