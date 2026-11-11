"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { Share, Smartphone, SquarePlus } from "lucide-react";
import { AlertChoices } from "@/components/alert-choices";
import { FamilyActivitySwitch } from "@/components/family-activity-switch";
import { SectionHeading } from "@/components/care-icon";
import { BabySettings } from "@/components/baby-settings";
import { LanguageSwitch } from "@/components/language-switch";
import { MyPumps } from "@/components/my-pumps";
import { PumpSchedule } from "@/components/pump-schedule";
import { ReminderSettings } from "@/components/reminder-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { WashByHours } from "@/components/wash-by-hours";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { iosNeedsInstall } from "@/lib/push-subscribe";

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
      <InstallReminder />
      <ReminderSettings />
      <FamilyActivitySwitch />
      <AlertChoices />
      <Button asChild variant="outline">
        <Link href="/onboarding?mode=edit">{t("settings.runSetup")}</Link>
      </Button>
      <SignOutButton />
    </section>
  );
}

function subscribeInstall(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function InstallReminder() {
  const { t } = useI18n();
  const show = useSyncExternalStore(subscribeInstall, iosNeedsInstall, () => false);

  if (!show) return null;

  return (
    <Card className="gap-3 p-4">
      <SectionHeading icon="bell">{t("settings.installCard")}</SectionHeading>
      <p className="text-sm leading-6 text-muted">{t("settings.installCardHint")}</p>
      <ol className="flex flex-col gap-2 text-sm leading-5">
        <li className="flex items-center gap-2">
          <Share className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("onboarding.installShare")}
        </li>
        <li className="flex items-center gap-2">
          <SquarePlus className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("onboarding.installAdd")}
        </li>
        <li className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("onboarding.installOpen")}
        </li>
      </ol>
    </Card>
  );
}
