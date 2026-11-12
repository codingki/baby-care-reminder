"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CareIcon, type CareIconName } from "@/components/care-icon";
import { Mark } from "@/components/mark";
import { PhoneFrame } from "@/components/phone-frame";
import { SyncDeviceTimezone } from "@/components/sync-device-timezone";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { useAnySheetOpen } from "@/components/sheet-presence";
import { CareQueryProvider } from "@/lib/query-provider";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";

const navItems = [
  { href: "/", labelKey: "shell.navHome", icon: "home" },
  { href: "/chiller", labelKey: "shell.navChiller", icon: "chiller" },
  { href: "/insights", labelKey: "shell.navInsights", icon: "insights" },
  { href: "/family", labelKey: "shell.navFamily", icon: "family" },
] as const satisfies ReadonlyArray<{ href: string; labelKey: MessageKey; icon: CareIconName }>;

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return (
      pathname === "/" ||
      pathname.startsWith("/log") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/onboarding") ||
      pathname === "/timeline" ||
      pathname.startsWith("/timeline/")
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
  if (href === "/insights") return pathname === "/insights" || pathname.startsWith("/insights/");
  if (href === "/family") {
    return pathname === "/family" || pathname.startsWith("/family/") || pathname.startsWith("/join");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <PhoneFrame>
      <CareQueryProvider>
      <SyncDeviceTimezone />
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-40 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground"
      >
        {t("shell.skip")}
      </a>
      <Suspense
        fallback={
          <>
            <BrandHeader />
            <main id="content" className="safe-x min-h-0 flex-1 overflow-y-auto py-5">
              {children}
            </main>
            <BottomNav pathname={null} />
          </>
        }
      >
        <PathChrome>{children}</PathChrome>
      </Suspense>
      </CareQueryProvider>
    </PhoneFrame>
  );
}

function hidesBrandHeader(pathname: string) {
  return (
    pathname === "/chiller" ||
    pathname.startsWith("/chiller/") ||
    pathname === "/insights" ||
    pathname.startsWith("/insights/") ||
    pathname === "/family" ||
    pathname.startsWith("/family/")
  );
}

function PathChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sheetOpen = useAnySheetOpen();
  const home = pathname === "/";
  const log = pathname.startsWith("/log");
  const setup = pathname.startsWith("/onboarding");
  const bare = hidesBrandHeader(pathname);
  const hideNav = sheetOpen || log || setup;
  const mainRef = useRef<HTMLElement>(null);
  const scrollTops = useRef(new Map<string, number>());
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    if (previousPath.current !== pathname) {
      scrollTops.current.set(previousPath.current, main.scrollTop);
      main.scrollTop = scrollTops.current.get(pathname) ?? 0;
      previousPath.current = pathname;
    }
    const remember = () => {
      scrollTops.current.set(pathname, main.scrollTop);
    };
    main.addEventListener("scroll", remember, { passive: true });
    return () => main.removeEventListener("scroll", remember);
  }, [pathname]);

  return (
    <>
      {home || bare || setup ? null : <BrandHeader />}
      <main
        id="content"
        ref={mainRef}
        className={`relative ${
          log
            ? "safe-x flex min-h-0 flex-1 flex-col overflow-y-auto pt-5 pb-5 max-sm:overflow-hidden max-sm:pb-0"
            : setup
              ? "safe-x min-h-0 flex-1 overflow-y-auto pt-[max(1rem,env(safe-area-inset-top))] pb-5"
            : home
              ? `safe-x min-h-0 flex-1 overflow-y-auto pt-[max(1rem,env(safe-area-inset-top))] ${hideNav ? "pb-5" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`
              : bare
                ? `safe-x min-h-0 flex-1 overflow-y-auto pt-[max(1.25rem,env(safe-area-inset-top))] ${hideNav ? "pb-5" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`
                : `safe-x min-h-0 flex-1 overflow-y-auto pt-5 ${hideNav ? "pb-5" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`
        }`}
      >
        <PullToRefresh scrollRef={mainRef} />
        {children}
      </main>
      {hideNav ? null : <BottomNav pathname={pathname} />}
    </>
  );
}

function BrandHeader() {
  const { t } = useI18n();

  return (
    <header className="safe-x sticky top-0 z-20 shrink-0 border-b border-line bg-background/95 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
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

function BottomNav({ pathname }: { pathname: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pressed, setPressed] = useState<string | null>(null);
  const current = pressed && pathname && !isActive(pathname, pressed) ? pressed : pathname;

  useEffect(() => {
    for (const item of navItems) router.prefetch(item.href);
  }, [router]);

  return (
    <nav
      aria-label={t("shell.navLabel")}
      className="safe-x fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="grid grid-cols-4">
        {navItems.map((item) => {
          const active = current ? isActive(current, item.href) : false;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                data-current={active ? "true" : "false"}
                onPointerDown={() => setPressed(item.href)}
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
