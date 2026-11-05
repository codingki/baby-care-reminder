"use client";

import { useI18n } from "@/i18n/provider";

export function SessionFallback() {
  const { t } = useI18n();
  return (
    <p className="text-sm text-muted" role="status">
      {t("shell.sessionChecking")}
    </p>
  );
}
