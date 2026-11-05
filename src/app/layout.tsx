import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Nunito } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/get-messages";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  applicationName: "Baby Care Reminder",
  title: {
    default: "Baby Care Reminder",
    template: "%s · Baby Care",
  },
  description: "Track diapers, feeds in ml, the chiller, and pump reminders with your family.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Baby Care",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#5f7f6c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <Suspense fallback={<div className="min-h-dvh bg-background" aria-busy="true" />}>
          <LocalizedApp>{children}</LocalizedApp>
        </Suspense>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

async function LocalizedApp({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = getMessages(locale);
  const lang = locale === "id" ? "id" : "en";

  return (
    <I18nProvider locale={locale} messages={messages}>
      <div lang={lang} className="min-h-dvh">
        <InlineScript html={`document.documentElement.lang=${JSON.stringify(lang)}`} />
        {children}
      </div>
    </I18nProvider>
  );
}
