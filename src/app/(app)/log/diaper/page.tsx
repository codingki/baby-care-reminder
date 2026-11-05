"use client";

import { ChoiceList, Screen } from "@/components/screen";

export default function DiaperPage() {
  return (
    <Screen titleKey="diaper.title" ledeKey="diaper.lede" backHref="/">
      <ChoiceList
        labelKey="diaper.title"
        optionKeys={["diaper.wet", "diaper.dirty", "diaper.mixed", "diaper.dry"]}
      />
    </Screen>
  );
}
