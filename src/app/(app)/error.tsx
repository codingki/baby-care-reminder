"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();

  return (
    <section className="flex flex-col gap-4" role="alert">
      <h1 className="text-3xl font-semibold tracking-tight">{t("error.title")}</h1>
      <p className="text-base leading-6 text-muted">{t("error.lede")}</p>
      <Button type="button" onClick={reset}>
        {t("error.retry")}
      </Button>
    </section>
  );
}
