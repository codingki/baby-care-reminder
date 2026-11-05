"use client";

import { useI18n } from "@/i18n/provider";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();

  return (
    <section className="flex flex-col gap-4" role="alert">
      <h1 className="text-3xl font-semibold tracking-tight">{t("error.title")}</h1>
      <p className="text-base leading-6 text-muted">{t("error.lede")}</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground"
      >
        {t("error.retry")}
      </button>
    </section>
  );
}
