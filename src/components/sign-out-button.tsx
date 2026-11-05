"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setPending(false);
      setMessage(t("settings.signOutError"));
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-semibold"
      >
        {pending ? t("settings.signingOut") : t("settings.signOut")}
      </button>
      {message ? (
        <p className="text-sm text-clay" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
