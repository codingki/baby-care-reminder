"use client";

import { useEffect } from "react";
import { AlertChoices } from "@/components/alert-choices";
import { LanguageSwitch } from "@/components/language-switch";
import { MyPumps } from "@/components/my-pumps";
import { ReminderSettings } from "@/components/reminder-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { WashByHours } from "@/components/wash-by-hours";
import { useI18n } from "@/i18n/provider";

export default function SettingsPage() {
  const { locale, t } = useI18n();

  useEffect(() => {
    document.title = `${t("settings.title")} · ${t("shell.brand")}`;
  }, [locale, t]);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-base leading-6 text-muted">{t("settings.lede")}</p>
      </header>
      <LanguageSwitch />
      <MyPumps />
      <WashByHours />
      <p className="text-sm leading-6 text-muted">{t("settings.deviceNote")}</p>
      <div className="rounded-3xl border border-line bg-card p-4">
        <h2 className="text-sm font-semibold">{t("settings.unit")}</h2>
        <p className="mt-2 text-base font-semibold">{t("settings.unitValue")}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{t("settings.unitHint")}</p>
      </div>
      <ReminderSettings />
      <AlertChoices />
      <SignOutButton />
    </section>
  );
}
