"use client";

import { useEffect, useState } from "react";
import { Mark } from "@/components/mark";
import { PhoneFrame } from "@/components/phone-frame";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-next-path";

export function LoginForm({
  nextPath,
  authError,
}: {
  nextPath: string;
  authError: boolean;
}) {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(
    authError ? t("login.errorLink") : null,
  );

  useEffect(() => {
    document.title = `${t("login.title")} · ${t("shell.brand")}`;
  }, [locale, t]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", safeNextPath(nextPath));
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo.toString(),
          shouldCreateUser: true,
        },
      });

      if (error) {
        setStatus("error");
        setMessage(t("login.errorSend"));
        return;
      }

      setStatus("sent");
      setMessage(t("login.sent"));
    } catch {
      setStatus("error");
      setMessage(t("login.errorSend"));
    }
  }

  return (
    <PhoneFrame>
    <main className="safe-x flex min-h-0 flex-1 flex-col overflow-y-auto bg-background pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="my-auto flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Mark className="h-12 w-12" />
          <p className="text-sm font-semibold tracking-[0.14em] text-muted uppercase">
            {t("shell.brand")}
          </p>
        </div>
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-base leading-6 text-muted">{t("login.lede")}</p>
        </header>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="email">
            {t("login.emailLabel")}
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              placeholder={t("login.emailPlaceholder")}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={status === "sending"}
            className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-70"
          >
            {status === "sending" ? t("login.sending") : t("login.submit")}
          </button>
          {message ? (
            <p className="text-sm leading-6" role="status">
              {message}
            </p>
          ) : null}
        </form>
        <p className="text-sm leading-6 text-muted">{t("login.footnote")}</p>
      </div>
    </main>
    </PhoneFrame>
  );
}
