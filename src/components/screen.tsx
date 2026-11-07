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
  icon,
  footer,
  children,
}: {
  titleKey: MessageKey;
  ledeKey: MessageKey;
  backHref?: string;
  showLater?: boolean;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { locale, t } = useI18n();

  useEffect(() => {
    document.title = `${t(titleKey)} · ${t("shell.brand")}`;
  }, [locale, t, titleKey]);

  const body = (
    <>
      <header className="flex flex-col gap-2">
        {backHref ? (
          <Link href={backHref} className="text-sm font-semibold text-accent">
            {t("common.back")}
          </Link>
        ) : null}
        <div className="flex items-center gap-3">
          {icon ? <span className="text-accent">{icon}</span> : null}
          <h1 className="text-3xl font-semibold tracking-tight">{t(titleKey)}</h1>
        </div>
        <p className="text-base leading-6 text-muted">{t(ledeKey)}</p>
      </header>
      {children}
      {showLater ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-3 text-sm leading-6 text-muted">
          {t("common.later")}
        </p>
      ) : null}
    </>
  );

  if (!footer) {
    return <section className="flex flex-col gap-5">{body}</section>;
  }

  return (
    <section className="flex flex-col gap-5 max-sm:min-h-0 max-sm:flex-1 max-sm:gap-0">
      <div className="flex flex-col gap-5 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:pb-4">
        {body}
      </div>
      <div className="flex flex-col gap-2 max-sm:shrink-0 max-sm:border-t max-sm:border-line max-sm:bg-background max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {footer}
      </div>
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
