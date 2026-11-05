import { en, type MessageShape } from "@/i18n/messages/en";
import { id } from "@/i18n/messages/id";
import type { Locale } from "@/i18n/locales";

export function getMessages(locale: Locale): MessageShape<typeof en> {
  return locale === "id" ? id : en;
}
