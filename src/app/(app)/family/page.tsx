"use client";

import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";

const roles = [
  { titleKey: "family.owner", detailKey: "family.ownerDetail" },
  { titleKey: "family.caregiver", detailKey: "family.caregiverDetail" },
  { titleKey: "family.viewer", detailKey: "family.viewerDetail" },
] as const satisfies ReadonlyArray<{ titleKey: MessageKey; detailKey: MessageKey }>;

export default function FamilyPage() {
  const { t } = useI18n();

  return (
    <Screen titleKey="family.title" ledeKey="family.lede">
      <ul className="flex flex-col gap-3">
        {roles.map((role) => (
          <li key={role.titleKey} className="rounded-3xl border border-line bg-card px-5 py-4">
            <h2 className="text-base font-semibold">{t(role.titleKey)}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{t(role.detailKey)}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-muted">{t("family.invites")}</p>
    </Screen>
  );
}
