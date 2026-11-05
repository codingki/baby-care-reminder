"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("accept_invite", { invite_token: token });
    setPending(false);
    if (error) {
      setNote(t("family.inviteError"));
      return;
    }
    router.push("/");
  }

  return (
    <Screen titleKey="family.joinTitle" ledeKey="family.joinLede" showLater={false}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void accept()}
        className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {t("family.join")}
      </button>
      {note ? (
        <p role="alert" className="text-sm">
          {note}
        </p>
      ) : null}
    </Screen>
  );
}
