"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { clearCareCache } from "@/lib/query-provider";
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
    await clearCareCache();
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
      <Button
        type="button"
        variant="outline"
        onClick={signOut}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <SavingLabel label={t("settings.signingOut")} />
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <CareIcon name="logOut" className="h-5 w-5" />
            {t("settings.signOut")}
          </span>
        )}
      </Button>
      {message ? (
        <p className="text-sm text-foreground" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
