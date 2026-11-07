"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/locales";
import { useI18n } from "@/i18n/provider";

const options = [
  { locale: "en", label: "English" },
  { locale: "id", label: "Bahasa Indonesia" },
] as const satisfies ReadonlyArray<{ locale: Locale; label: string }>;

export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<Locale | null>(null);
  const selected = chosen ?? locale;

  useEffect(() => {
    document.documentElement.lang = selected;
  }, [selected]);

  function choose(next: Locale) {
    if (next === selected) return;
    setChosen(next);
    startTransition(async () => {
      await setLocale(next);
      setChosen(null);
      router.refresh();
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4" disabled={pending}>
      <legend className="px-1 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <CareIcon name="language" className="h-4 w-4 text-accent" />
          {t("settings.language")}
        </span>
      </legend>
      <p className="text-sm leading-6 text-muted">{t("settings.languageHint")}</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("settings.language")}>
        {options.map((option) => {
          const pressed = selected === option.locale;
          return (
            <button
              key={option.locale}
              type="button"
              aria-pressed={pressed}
              onClick={() => choose(option.locale)}
              className={`min-h-12 rounded-2xl px-3 text-sm font-semibold ${
                pressed
                  ? "bg-accent text-accent-foreground"
                  : "border border-line bg-background text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          <SavingLabel label={t("common.saving")} />
        </p>
      ) : null}
    </fieldset>
  );
}
