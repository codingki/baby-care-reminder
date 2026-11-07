"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CareIcon, type CareIconName } from "@/components/care-icon";
import { Mark } from "@/components/mark";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";

const navItems = [
  { href: "/", labelKey: "shell.navHome", icon: "home" },
  { href: "/chiller", labelKey: "shell.navChiller", icon: "chiller" },
  { href: "/timeline", labelKey: "shell.navSchedule", icon: "schedule" },
  { href: "/family", labelKey: "shell.navFamily", icon: "family" },
] as const satisfies ReadonlyArray<{ href: string; labelKey: MessageKey; icon: CareIconName }>;

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return (
      pathname === "/" ||
      pathname.startsWith("/log") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/onboarding")
    );
  }
  if (href === "/chiller") {
    return (
      pathname === "/chiller" ||
      pathname.startsWith("/chiller/") ||
      pathname === "/bottles" ||
      pathname.startsWith("/bottles/")
    );
  }
  if (href === "/timeline") return pathname === "/timeline" || pathname.startsWith("/timeline/");
  if (href === "/family") {
    return pathname === "/family" || pathname.startsWith("/family/") || pathname.startsWith("/join");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-[0_0_0_1px_var(--line)]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground"
      >
        {t("shell.skip")}
      </a>
      <Suspense
        fallback={
          <>
            <BrandHeader />
            <main
              id="content"
              className="flex-1 px-5 py-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))]"
            >
              {children}
            </main>
          </>
        }
      >
        <PathChrome>{children}</PathChrome>
      </Suspense>
      <Suspense fallback={<BottomNav pathname={null} />}>
        <ActiveBottomNav />
      </Suspense>
    </div>
  );
}

function PathChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";

  return (
    <>
      {home ? null : <BrandHeader />}
      <main
        id="content"
        className={
          home
            ? "flex-1 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(5.75rem+env(safe-area-inset-bottom))]"
            : "flex-1 px-5 py-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))]"
        }
      >
        {children}
      </main>
    </>
  );
}

function BrandHeader() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/95 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
        {t("shell.eyebrow")}
      </p>
      <Link href="/" className="mt-1 flex items-center gap-3">
        <Mark />
        <span className="text-lg font-semibold tracking-tight">{t("shell.brand")}</span>
      </Link>
    </header>
  );
}

function ActiveBottomNav() {
  const pathname = usePathname();
  return <BottomNav pathname={pathname} />;
}

function BottomNav({ pathname }: { pathname: string | null }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("shell.navLabel")}
      className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-line bg-card/95 backdrop-blur"
    >
      <ul className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const active = pathname ? isActive(pathname, item.href) : false;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <CareIcon name={item.icon} className="h-5 w-5" />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
