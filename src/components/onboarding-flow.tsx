"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BabyPhotoField, replaceBabyPhoto } from "@/components/baby-photo";
import { DecimalInput } from "@/components/decimal-input";
import { PumpHourDayFields } from "@/components/pump-schedule";
import { SavingLabel } from "@/components/saving-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionSheet } from "@/components/option-sheet";
import { useI18n } from "@/i18n/provider";
import { parseDecimal } from "@/lib/decimal";
import { saveDeviceTimeZone } from "@/lib/device-timezone";
import { DEFAULT_DIAPER_INTERVAL_MINUTES, DEFAULT_FEED_INTERVAL_MINUTES } from "@/lib/feed-interval";
import { loadRemotePumps, persistOwnedPump } from "@/lib/family-pumps";
import { addOwnedPump, removeOwnedPump } from "@/lib/device-care";
import { normalizeDays, normalizeHours } from "@/lib/pump-schedule";
import { catalogByBrand } from "@/lib/pump-catalog";
import { iosNeedsInstall, subscribeToPush } from "@/lib/push-subscribe";
import { chooseBaby, rememberBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

type BabyDraft = {
  id: string;
  name: string;
  birthDate: string;
  photoPath: string | null;
  feedMinutes: number | null;
  diaperMinutes: number | null;
};

type Flow = {
  userId: string;
  displayName: string;
  familyId: string | null;
  familyName: string;
  step: number;
  resume: number;
  babies: BabyDraft[];
  selectedBabyId: string | null;
  pumpCount: number;
  pumpHours: number[];
  pumpDays: number[];
};

const TOTAL = 6;

function normalizeBirthDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (!parts) return null;
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const year = parts[3];
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inviteToken(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/join\/([^/?#]+)/);
  return (match?.[1] ?? trimmed).trim();
}

function resumeStep(step: number, displayName: string, familyId: string | null, babyCount: number) {
  if (step >= 6) return 6;
  if (!displayName && step < 6) return 1;
  if (!familyId) return 2;
  if (babyCount === 0) return 3;
  return Math.min(6, Math.max(4, step));
}

async function loadFlow(userId: string): Promise<Flow> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const metadataName =
    typeof userData.user?.user_metadata?.display_name === "string" ? userData.user.user_metadata.display_name.trim() : "";
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, display_name")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const familyId = membership?.family_id ?? null;
  const displayName = (typeof membership?.display_name === "string" ? membership.display_name.trim() : "") || metadataName;

  if (!familyId) {
    return {
      userId,
      displayName,
      familyId: null,
      familyName: "",
      step: displayName ? 2 : 1,
      resume: displayName ? 2 : 1,
      babies: [],
      selectedBabyId: null,
      pumpCount: 0,
      pumpHours: [],
      pumpDays: [1, 2, 3, 4, 5, 6, 7],
    };
  }

  const [{ data: family }, { data: babyRows }, { data: settings }, { count }] = await Promise.all([
    supabase.from("families").select("name, pump_hours, pump_days").eq("id", familyId).maybeSingle(),
    supabase
      .from("babies")
      .select("id, name, birth_date, photo_path, suggested_interval_minutes, diaper_interval_minutes")
      .eq("family_id", familyId)
      .order("created_at"),
    supabase.from("member_settings").select("onboarding_step").eq("user_id", userId).eq("family_id", familyId).maybeSingle(),
    supabase.from("family_pumps").select("id", { count: "exact", head: true }).eq("family_id", familyId),
  ]);
  const babies: BabyDraft[] = (babyRows ?? []).flatMap((row) => {
    if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.birth_date !== "string") return [];
    return [
      {
        id: row.id,
        name: row.name,
        birthDate: row.birth_date,
        photoPath: typeof row.photo_path === "string" ? row.photo_path : null,
        feedMinutes: typeof row.suggested_interval_minutes === "number" ? row.suggested_interval_minutes : null,
        diaperMinutes: typeof row.diaper_interval_minutes === "number" ? row.diaper_interval_minutes : null,
      },
    ];
  });
  const step = typeof settings?.onboarding_step === "number" ? settings.onboarding_step : babies.length > 0 ? 7 : 1;
  return {
    userId,
    displayName,
    familyId,
    familyName: typeof family?.name === "string" ? family.name : "",
    step,
    resume: resumeStep(step, displayName, familyId, babies.length),
    babies,
    selectedBabyId: chooseBaby(familyId, babies.map((baby) => baby.id)),
    pumpCount: count ?? 0,
    pumpHours: normalizeHours(family?.pump_hours),
    pumpDays: normalizeDays(family?.pump_days),
  };
}

export function OnboardingFlow() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const editing = useSearchParams().get("mode") === "edit";
  const queryClient = useQueryClient();
  const flowQuery = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("signed out");
      return loadFlow(data.user.id);
    },
  });
  const flow = flowQuery.data;
  const [step, setStep] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [invite, setInvite] = useState("");
  const [joining, setJoining] = useState(false);
  const [babyName, setBabyName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pumpChoice, setPumpChoice] = useState(catalogByBrand()[0]?.pumps[0]?.id ?? "custom");
  const [customPump, setCustomPump] = useState("");
  const [nickname, setNickname] = useState("");
  const [feedMinutes, setFeedMinutes] = useState(String(DEFAULT_FEED_INTERVAL_MINUTES));
  const [diaperMinutes, setDiaperMinutes] = useState(String(DEFAULT_DIAPER_INTERVAL_MINUTES));
  const [hours, setHours] = useState<number[]>([]);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [note, setNote] = useState<string | null>(null);
  const [primed, setPrimed] = useState("");

  if (flow && primed !== `${flow.userId}:${flow.familyId}:${editing}`) {
    setPrimed(`${flow.userId}:${flow.familyId}:${editing}`);
    setStep(editing ? 1 : flow.resume);
    setName(flow.displayName);
    setFamilyName(flow.familyName);
    const baby = flow.babies.find((item) => item.id === flow.selectedBabyId) ?? flow.babies[0];
    setBabyName(baby?.name ?? "");
    setBirthDate(baby?.birthDate ?? "");
    setFeedMinutes(String(baby?.feedMinutes ?? DEFAULT_FEED_INTERVAL_MINUTES));
    setDiaperMinutes(String(baby?.diaperMinutes ?? DEFAULT_DIAPER_INTERVAL_MINUTES));
    setHours(flow.pumpHours);
    setDays(flow.pumpDays);
  }

  useEffect(() => {
    if (!flow?.userId || !flow.familyId) return;
    void saveDeviceTimeZone(flow.userId, flow.familyId);
  }, [flow?.userId, flow?.familyId]);

  useEffect(() => {
    const titles = [
      t("onboarding.yourName"),
      t("onboarding.familyTitle"),
      t("onboarding.title"),
      t("onboarding.pumpTitle"),
      t("onboarding.remindersTitle"),
      t("onboarding.notificationsTitle"),
    ];
    document.title = `${titles[(step ?? 1) - 1] ?? t("onboarding.title")} · ${t("shell.brand")}`;
  }, [locale, step, t]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    await queryClient.invalidateQueries({ queryKey: ["family"] });
    await queryClient.invalidateQueries({ queryKey: ["care-scope"] });
  };

  const saveStep = useMutation({
    mutationFn: async (nextStep: number) => {
      if (!flow?.familyId || editing) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("member_settings")
        .update({ onboarding_step: nextStep })
        .eq("user_id", flow.userId)
        .eq("family_id", flow.familyId);
      if (error && !/onboarding_step/.test(error.message)) throw error;
    },
    onSuccess: refresh,
  });

  async function go(nextStep: number) {
    setNote(null);
    try {
      if (nextStep > TOTAL) {
        if (!editing && flow?.familyId) await saveStep.mutateAsync(7);
        router.push(editing ? "/settings" : "/");
        router.refresh();
        return;
      }
      if (!editing && flow?.familyId && nextStep > flow.step) await saveStep.mutateAsync(nextStep);
      setStep(nextStep);
    } catch {
      setNote(t("onboarding.error"));
    }
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || !flow) {
      setNote(t("onboarding.error"));
      return;
    }
    const supabase = createClient();
    const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    if (metaError) {
      setNote(t("onboarding.error"));
      return;
    }
    if (flow.familyId) {
      const { error } = await supabase
        .from("family_members")
        .update({ display_name: trimmed })
        .eq("user_id", flow.userId)
        .eq("family_id", flow.familyId);
      if (error) {
        setNote(error.message || t("onboarding.error"));
        return;
      }
    }
    await refresh();
    await go(2);
  }

  async function createFamily() {
    const trimmed = familyName.trim();
    if (!trimmed || !flow) {
      setNote(t("onboarding.error"));
      return;
    }
    if (flow.familyId) {
      const supabase = createClient();
      const { error } = await supabase.from("families").update({ name: trimmed }).eq("id", flow.familyId);
      if (error) {
        setNote(error.message || t("onboarding.error"));
        return;
      }
      await refresh();
      await go(3);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("families")
      .insert({ name: trimmed, created_by: flow.userId })
      .select("id")
      .single();
    if (error || !data?.id) {
      setNote(error?.message || t("onboarding.error"));
      return;
    }
    if (name.trim()) {
      await supabase.from("family_members").update({ display_name: name.trim() }).eq("user_id", flow.userId).eq("family_id", data.id);
    }
    await supabase.from("member_settings").update({ onboarding_step: 3 }).eq("user_id", flow.userId).eq("family_id", data.id);
    await refresh();
    setStep(3);
  }

  async function joinFamily() {
    const token = inviteToken(invite);
    if (token.length < 32) {
      setNote(t("family.inviteError"));
      return;
    }
    const supabase = createClient();
    const { data: familyId, error } = await supabase.rpc("accept_invite", { invite_token: token });
    if (error || !familyId) {
      setNote(t("family.inviteError"));
      return;
    }
    const { count } = await supabase
      .from("babies")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId);
    const next = count ? 6 : 3;
    if (name.trim()) {
      await supabase.from("family_members").update({ display_name: name.trim() }).eq("user_id", flow?.userId).eq("family_id", familyId);
    }
    await supabase.from("member_settings").update({ onboarding_step: next }).eq("user_id", flow?.userId).eq("family_id", familyId);
    await refresh();
    setStep(next);
  }

  async function saveBaby(form: HTMLFormElement) {
    if (!flow?.familyId) return;
    const birthInput = form.querySelector<HTMLInputElement>("input[type='date']");
    const birth = normalizeBirthDate(birthInput?.value || birthDate);
    if (!babyName.trim() || !birth) {
      setNote(t("onboarding.error"));
      toast(t("onboarding.error"));
      return;
    }
    const supabase = createClient();
    const existing = flow.babies.find((baby) => baby.id === flow.selectedBabyId) ?? flow.babies[0];
    if (existing) {
      const { error } = await supabase
        .from("babies")
        .update({ name: babyName.trim(), birth_date: birth })
        .eq("id", existing.id);
      if (error) {
        setNote(error.message || t("onboarding.error"));
        return;
      }
      if (photoFile) {
        const path = await replaceBabyPhoto(flow.familyId, existing.id, existing.photoPath, photoFile);
        if (!path) setNote(t("family.photoFailed"));
        setPhotoFile(null);
      }
      rememberBaby(flow.familyId, existing.id);
    } else {
      const { data, error } = await supabase
        .from("babies")
        .insert({ family_id: flow.familyId, name: babyName.trim(), birth_date: birth })
        .select("id")
        .single();
      if (error || !data?.id) {
        setNote(error?.message || t("onboarding.error"));
        return;
      }
      if (photoFile) {
        const path = await replaceBabyPhoto(flow.familyId, data.id, null, photoFile);
        if (!path) setNote(t("family.photoFailed"));
        setPhotoFile(null);
      }
      rememberBaby(flow.familyId, data.id);
    }
    await refresh();
    await go(4);
  }

  async function addPump() {
    if (!flow?.familyId) return;
    if (pumpChoice !== "custom") {
      const remote = await loadRemotePumps();
      if (remote?.some((pump) => pump.catalogId === pumpChoice)) {
        await go(5);
        return;
      }
    }
    const created = addOwnedPump({
      catalogId: pumpChoice === "custom" ? null : pumpChoice,
      customName: customPump,
      nickname,
    });
    if (!created) {
      setNote(t("onboarding.error"));
      return;
    }
    const result = await persistOwnedPump(created);
    if (result === "error") {
      removeOwnedPump(created.id);
      setNote(t("common.failed"));
      return;
    }
    setCustomPump("");
    setNickname("");
    await refresh();
  }

  async function saveReminders() {
    if (!flow?.familyId) return;
    const feed = parseDecimal(feedMinutes);
    const diaper = parseDecimal(diaperMinutes);
    if (feed === null || feed <= 0 || diaper === null || diaper <= 0) {
      setNote(t("onboarding.error"));
      return;
    }
    const baby = flow.babies.find((item) => item.id === flow.selectedBabyId) ?? flow.babies[0];
    const supabase = createClient();
    if (baby) {
      const { error } = await supabase
        .from("babies")
        .update({
          suggested_interval_minutes: Math.round(feed),
          diaper_interval_minutes: Math.round(diaper),
        })
        .eq("id", baby.id);
      if (error) {
        setNote(error.message || t("onboarding.error"));
        return;
      }
    }
    if (flow.pumpCount > 0) {
      const { data: settings } = await supabase
        .from("member_settings")
        .select("timezone")
        .eq("user_id", flow.userId)
        .eq("family_id", flow.familyId)
        .maybeSingle();
      const zone = typeof settings?.timezone === "string" && settings.timezone ? settings.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { error } = await supabase
        .from("families")
        .update({ pump_hours: hours, pump_days: days, pump_schedule_timezone: zone || "UTC" })
        .eq("id", flow.familyId);
      if (error) {
        setNote(error.message || t("onboarding.error"));
        return;
      }
    }
    await refresh();
    await go(6);
  }

  async function allowNotifications() {
    if (!flow?.familyId) return;
    const result = await subscribeToPush(flow.userId, flow.familyId);
    if (result === "ok") {
      await go(7);
      return;
    }
    if (result === "denied") setNote(t("settings.notificationsDenied"));
    else if (result === "unsupported") setNote(t("settings.notificationsUnsupported"));
    else if (result === "missing-key") setNote(t("settings.vapidMissing"));
    else if (result === "ios-install") setNote(t("settings.iosBody"));
    else setNote(t("common.failed"));
  }

  const pending = saveStep.isPending;
  const current = step ?? 1;
  const baby = flow?.babies.find((item) => item.id === flow.selectedBabyId) ?? flow?.babies[0];
  const groups = catalogByBrand();

  return (
    <section className="flex flex-col gap-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3">
        <ol className="flex flex-1 gap-1.5" aria-label={t("onboarding.progress", { current: String(current), total: String(TOTAL) })}>
          {Array.from({ length: TOTAL }, (_, index) => (
            <li key={index} className={`h-1.5 flex-1 rounded-full ${index < current ? "bg-accent" : "bg-line"}`} />
          ))}
        </ol>
        {editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/settings")}>
            {t("onboarding.exit")}
          </Button>
        ) : null}
      </div>

      {flowQuery.isPending || !flow || step === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : (
        <>
          {current === 1 ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
            >
              <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.yourName")}</h1>
                <p className="text-sm leading-6 text-muted">{t("onboarding.yourNameHint")}</p>
              </header>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-name">
                {t("onboarding.name")}
                <Input id="setup-name" required value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <StepActions editing={editing} pending={pending} back={null} label={t("onboarding.next")} />
            </form>
          ) : null}

          {current === 2 ? (
            <div className="flex flex-col gap-4">
              <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.familyTitle")}</h1>
                <p className="text-sm leading-6 text-muted">{t("onboarding.familyChoice")}</p>
              </header>
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createFamily();
                }}
              >
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-family">
                  {t("onboarding.familyName")}
                  <Input id="setup-family" required value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
                </label>
                <Button type="submit" disabled={pending}>
                  {pending ? <SavingLabel label={t("common.saving")} /> : flow.familyId ? t("common.save") : t("onboarding.saveFamily")}
                </Button>
              </form>
              {flow.familyId ? null : (
                <form
                  className="flex flex-col gap-3 border-t border-line pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setJoining(true);
                    void joinFamily().finally(() => setJoining(false));
                  }}
                >
                  <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-invite">
                    {t("onboarding.inviteCode")}
                    <Input
                      id="setup-invite"
                      value={invite}
                      onChange={(event) => setInvite(event.target.value)}
                      placeholder={t("onboarding.inviteHint")}
                    />
                  </label>
                  <Button type="submit" variant="outline" disabled={joining}>
                    {joining ? <SavingLabel label={t("common.saving")} /> : t("onboarding.joinFamily")}
                  </Button>
                </form>
              )}
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                {t("onboarding.back")}
              </Button>
            </div>
          ) : null}

          {current === 3 ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveBaby(event.currentTarget);
              }}
            >
              <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.title")}</h1>
                <p className="text-sm leading-6 text-muted">{t("onboarding.babyHint")}</p>
              </header>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-baby">
                {t("onboarding.name")}
                <Input id="setup-baby" required value={babyName} onChange={(event) => setBabyName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-birth">
                {t("onboarding.birthDate")}
                <Input id="setup-birth" type="date" required value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
              </label>
              {baby && flow.familyId ? (
                <BabyPhotoField
                  familyId={flow.familyId}
                  babyId={baby.id}
                  name={babyName || baby.name}
                  path={baby.photoPath}
                  onChange={() => void refresh()}
                />
              ) : (
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-photo">
                  {t("family.photo")}
                  <Input
                    id="setup-photo"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              <StepActions editing={editing} pending={pending} back={() => setStep(2)} label={t("onboarding.next")} />
            </form>
          ) : null}

          {current === 4 ? (
            <div className="flex flex-col gap-4">
              <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.pumpTitle")}</h1>
                <p className="text-sm leading-6 text-muted">{t("onboarding.pumpHint")}</p>
              </header>
              <p className="text-sm text-muted">
                {flow.pumpCount > 0 ? t("onboarding.pumpAdded", { count: String(flow.pumpCount) }) : t("settings.noPumps")}
              </p>
              <OptionSheet
                id="setup-pump"
                label={t("settings.brandModel")}
                value={pumpChoice}
                searchable
                options={[
                  ...groups.flatMap((group) =>
                    group.pumps.map((pump) => ({ value: pump.id, label: `${group.brand} · ${pump.model}` })),
                  ),
                  { value: "custom", label: t("settings.custom") },
                ]}
                onChange={setPumpChoice}
              />
              {pumpChoice === "custom" ? (
                <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-custom-pump">
                  {t("settings.customName")}
                  <Input id="setup-custom-pump" value={customPump} onChange={(event) => setCustomPump(event.target.value)} />
                </label>
              ) : null}
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-nickname">
                {t("settings.nickname")}
                <Input id="setup-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
              </label>
              <Button type="button" variant="outline" onClick={() => void addPump()}>
                {t("settings.addPump")}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setStep(3)}>
                  {t("onboarding.back")}
                </Button>
                {flow.pumpCount === 0 ? (
                  <Button type="button" variant="outline" className="flex-1" onClick={() => void go(5)}>
                    {t("onboarding.noPump")}
                  </Button>
                ) : (
                  <Button type="button" className="flex-1" onClick={() => void go(5)}>
                    {t("onboarding.next")}
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {current === 5 ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveReminders();
              }}
            >
              <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.remindersTitle")}</h1>
                <p className="text-sm leading-6 text-muted">{t("onboarding.remindersHint")}</p>
              </header>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-feed">
                {t("settings.feedInterval")}
                <DecimalInput locale={locale} id="setup-feed" value={feedMinutes} onValueChange={setFeedMinutes} />
              </label>
              <p className="text-sm text-muted">{t("settings.feedIntervalHint")}</p>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="setup-diaper">
                {t("settings.diaperInterval")}
                <DecimalInput locale={locale} id="setup-diaper" value={diaperMinutes} onValueChange={setDiaperMinutes} />
              </label>
              <p className="text-sm text-muted">{t("settings.diaperIntervalHint")}</p>
              {flow.pumpCount > 0 ? (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <h2 className="text-base font-semibold">{t("settings.pumpSchedule")}</h2>
                  <PumpHourDayFields hours={hours} days={days} onHours={setHours} onDays={setDays} />
                </div>
              ) : null}
              <StepActions editing={editing} pending={pending} back={() => setStep(4)} label={t("onboarding.next")} />
            </form>
          ) : null}

          {current === 6 ? (
            <div className="flex flex-col gap-4">
              <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.notificationsTitle")}</h1>
                <p className="text-sm leading-6 text-muted">{t("settings.notificationsHint")}</p>
              </header>
              {iosNeedsInstall() ? (
                <ol className="flex flex-col gap-2 text-sm leading-6">
                  <li>{t("settings.installHint")}</li>
                  <li>{t("settings.iosShare")}</li>
                  <li>{t("settings.iosBody")}</li>
                </ol>
              ) : null}
              <Button type="button" onClick={() => void allowNotifications()}>
                {t("settings.enableNotifications")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void go(7)}>
                {t("onboarding.maybeLater")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep(5)}>
                {t("onboarding.back")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {note ? (
        <p role="alert" className="text-sm">
          {note}
        </p>
      ) : null}
    </section>
  );
}

function StepActions({
  editing,
  pending,
  back,
  label,
}: {
  editing: boolean;
  pending: boolean;
  back: (() => void) | null;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      {back ? (
        <Button type="button" variant="ghost" className="flex-1" onClick={back}>
          {t("onboarding.back")}
        </Button>
      ) : editing ? null : null}
      <Button type="submit" className="flex-1" disabled={pending} aria-busy={pending}>
        {pending ? <SavingLabel label={t("common.saving")} /> : label}
      </Button>
    </div>
  );
}
