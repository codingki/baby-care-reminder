"use client";

import { ChoiceList, Screen } from "@/components/screen";

export default function OnboardingPage() {
  return (
    <Screen titleKey="onboarding.title" ledeKey="onboarding.lede" backHref="/">
      <ChoiceList
        labelKey="onboarding.name"
        optionKeys={["onboarding.birthDate", "onboarding.weight"]}
      />
      <ChoiceList
        labelKey="onboarding.sex"
        optionKeys={["onboarding.female", "onboarding.male", "onboarding.unspecified"]}
      />
    </Screen>
  );
}
