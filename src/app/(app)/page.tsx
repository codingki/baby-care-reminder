"use client";

import { useEffect } from "react";
import Link from "next/link";
import { HomeReminders } from "@/components/home-reminders";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";

const actions = [
  {
    href: "/log/diaper",
    titleKey: "home.diaper",
    detailKey: "home.diaperDetail",
  },
  {
    href: "/log/feed",
    titleKey: "home.feed",
    detailKey: "home.feedDetail",
  },
  {
    href: "/log/pump",
    titleKey: "home.pump",
    detailKey: "home.pumpDetail",
  },
] as const satisfies ReadonlyArray<{
  href: string;
  titleKey: MessageKey;
  detailKey: MessageKey;
}>;

export default function HomePage() {
  const { locale, t } = useI18n();

  useEffect(() => {
    document.title = `${t("home.title")} · ${t("shell.brand")}`;
  }, [locale, t]);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("home.title")}</h1>
        <p className="text-base leading-6 text-muted">{t("home.lede")}</p>
      </header>
      <ul className="flex flex-col gap-3">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="flex min-h-24 flex-col justify-center rounded-3xl border border-line bg-card px-5 py-4"
            >
              <span className="text-xl font-semibold text-accent">{t(action.titleKey)}</span>
              <span className="mt-1 text-sm opacity-90">{t(action.detailKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <HomeReminders />
      <ul className="flex flex-col gap-3">
        <li>
          <Link href="/onboarding" className="block rounded-3xl border border-line bg-card px-5 py-4">
            <span className="block text-base font-semibold">{t("home.profile")}</span>
            <span className="mt-1 block text-sm leading-6 text-muted">{t("home.profileDetail")}</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
