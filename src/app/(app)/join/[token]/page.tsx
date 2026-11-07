"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  async function accept() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setNote(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("accept_invite", { invite_token: token });
      if (error) {
        setNote(t("family.inviteError"));
        return;
      }
      router.push("/");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Screen titleKey="family.joinTitle" ledeKey="family.joinLede" showLater={false}>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void accept()}
        className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {pending ? <SavingLabel label={t("common.saving")} /> : t("family.join")}
      </button>
      {note ? (
        <p role="alert" className="text-sm">
          {note}
        </p>
      ) : null}
    </Screen>
  );
}
