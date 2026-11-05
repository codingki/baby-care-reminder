"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";

export function Screen({
  titleKey,
  ledeKey,
  backHref,
  showLater = true,
  children,
}: {
  titleKey: MessageKey;
  ledeKey: MessageKey;
  backHref?: string;
  showLater?: boolean;
  children?: React.ReactNode;
}) {
  const { locale, t } = useI18n();

  useEffect(() => {
    document.title = `${t(titleKey)} · ${t("shell.brand")}`;
  }, [locale, t, titleKey]);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        {backHref ? (
          <Link href={backHref} className="text-sm font-semibold text-accent">
            {t("common.back")}
          </Link>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{t(titleKey)}</h1>
        <p className="text-base leading-6 text-muted">{t(ledeKey)}</p>
      </header>
      {children}
      {showLater ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-3 text-sm leading-6 text-muted">
          {t("common.later")}
        </p>
      ) : null}
    </section>
  );
}

export function ChoiceList({
  labelKey,
  optionKeys,
}: {
  labelKey: MessageKey;
  optionKeys: MessageKey[];
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted">{t(labelKey)}</h2>
      <ul className="flex flex-wrap gap-2">
        {optionKeys.map((key) => (
          <li
            key={key}
            className="rounded-full border border-line bg-card px-3 py-2 text-sm font-medium"
          >
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
