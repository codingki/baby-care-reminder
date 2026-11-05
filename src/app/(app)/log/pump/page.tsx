"use client";

import { ChoiceList, Screen } from "@/components/screen";

export default function PumpPage() {
  return (
    <Screen titleKey="pump.title" ledeKey="pump.lede" backHref="/">
      <ChoiceList
        labelKey="pump.title"
        optionKeys={["pump.left", "pump.right", "pump.both", "pump.duration"]}
      />
    </Screen>
  );
}
