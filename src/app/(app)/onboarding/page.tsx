"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AddBabyForm } from "@/components/add-baby-form";
import { BabyPhotoField } from "@/components/baby-photo";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoBaby, setPhotoBaby] = useState<{ id: string; name: string; path: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      const { data: membership } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (membership?.family_id) setFamilyId(membership.family_id);
    });
  }, []);

  async function createFamily() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setError(t("onboarding.signIn"));
        return;
      }
      const { data, error: insertError } = await supabase
        .from("families")
        .insert({ name: familyName.trim(), created_by: userId })
        .select("id")
        .single();
      if (insertError || !data) {
        setError(t("onboarding.error"));
        return;
      }
      setFamilyId(data.id);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Screen
      titleKey={photoBaby ? "onboarding.photoTitle" : familyId ? "onboarding.title" : "onboarding.familyTitle"}
      ledeKey={photoBaby ? "onboarding.photoLede" : "onboarding.lede"}
      backHref="/"
      showLater={false}
      icon={<CareIcon name={familyId ? "baby" : "family"} className="h-8 w-8" />}
    >
      {photoBaby && familyId ? (
        <div className="flex flex-col gap-4">
          <BabyPhotoField
            familyId={familyId}
            babyId={photoBaby.id}
            name={photoBaby.name}
            path={photoBaby.path}
            onChange={(path) => setPhotoBaby({ ...photoBaby, path })}
          />
          <Button type="button" variant="outline" onClick={() => router.push("/")}>
            {photoBaby.path ? t("onboarding.photoContinue") : t("onboarding.photoSkip")}
          </Button>
        </div>
      ) : familyId === null ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void createFamily();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="family-name">
            {t("onboarding.familyName")}
            <input
              id="family-name"
              required
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-4 text-base font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending ? <SavingLabel label={t("common.saving")} /> : t("onboarding.saveFamily")}
          </button>
        </form>
      ) : (
        <AddBabyForm
          familyId={familyId}
          idPrefix="onboarding-baby"
          onCreated={(baby) => setPhotoBaby({ id: baby.id, name: baby.name, path: null })}
        />
      )}
      {error ? (
        <p className="text-sm text-foreground" role="alert">
          {error}
        </p>
      ) : null}
    </Screen>
  );
}
