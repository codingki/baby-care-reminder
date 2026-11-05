"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import type { MessageKey, Messages } from "@/i18n/translate";
import { translate } from "@/i18n/translate";

type I18nValue = {
  locale: Locale;
  messages: Messages;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: I18nValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  const { locale, messages } = context;
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string>) => translate(messages, key, vars),
    [messages],
  );

  return { locale, t };
}
