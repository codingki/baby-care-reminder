import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, negotiateLocale, type Locale } from "@/i18n/locales";

export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return negotiateLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );
});
