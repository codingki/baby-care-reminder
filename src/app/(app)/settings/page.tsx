"use client";

import { useEffect } from "react";
import { AlertChoices } from "@/components/alert-choices";
import { SectionHeading } from "@/components/care-icon";
import { BabySettings } from "@/components/baby-settings";
import { LanguageSwitch } from "@/components/language-switch";
import { MyPumps } from "@/components/my-pumps";
import { PumpSchedule } from "@/components/pump-schedule";
import { ReminderSettings } from "@/components/reminder-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { WashByHours } from "@/components/wash-by-hours";
import { Card } from "@/components/ui/card";
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
      <BabySettings />
      <MyPumps />
      <PumpSchedule />
      <WashByHours />
      <p className="text-sm leading-6 text-muted">{t("settings.deviceNote")}</p>
      <Card className="gap-2 p-4">
        <SectionHeading icon="beaker">{t("settings.unit")}</SectionHeading>
        <p className="mt-2 text-base font-semibold">{t("settings.unitValue")}</p>
        <p className="text-sm leading-6 text-muted">{t("settings.unitHint")}</p>
      </Card>
      <ReminderSettings />
      <AlertChoices />
      <SignOutButton />
    </section>
  );
}
