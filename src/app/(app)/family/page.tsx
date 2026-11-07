"use client";

import { useEffect, useRef, useState } from "react";
import { SavingLabel } from "@/components/saving-label";
import { BabyProfile } from "@/components/baby-profile";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  userId: string;
  role: "owner" | "caregiver" | "viewer";
  name: string;
};

type Invite = {
  id: string;
  role: "caregiver" | "viewer";
  token: string;
  expiresAt: string;
};

export default function FamilyPage() {
  const { t } = useI18n();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<Member["role"] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"caregiver" | "viewer">("caregiver");
  const [link, setLink] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState<"name" | "invite" | null>(null);
  const lock = useRef(false);

  async function refresh(currentFamilyId: string, currentUserId: string) {
    const supabase = createClient();
    const [memberResult, inviteResult] = await Promise.all([
      supabase
        .from("family_members")
        .select("id, user_id, role, display_name")
        .eq("family_id", currentFamilyId),
      supabase
        .from("invites")
        .select("id, role, token, expires_at, used_at")
        .eq("family_id", currentFamilyId)
        .is("used_at", null)
        .order("created_at", { ascending: false }),
    ]);
    if (memberResult.error) {
      setState("error");
      return;
    }
    const nextMembers = (memberResult.data ?? []).flatMap((row) => {
      if (row.role !== "owner" && row.role !== "caregiver" && row.role !== "viewer") return [];
      return [
        {
          id: String(row.id),
          userId: String(row.user_id),
          role: row.role,
          name: typeof row.display_name === "string" ? row.display_name : "",
        },
      ];
    });
    setMembers(nextMembers);
    const mine = nextMembers.find((member) => member.userId === currentUserId);
    setRole(mine?.role ?? null);
    setName(mine?.name ?? "");
    setInvites(
      (inviteResult.data ?? []).flatMap((row) => {
        if (row.role !== "caregiver" && row.role !== "viewer") return [];
        if (row.used_at) return [];
        return [
          {
            id: String(row.id),
            role: row.role,
            token: String(row.token),
            expiresAt: String(row.expires_at),
          },
        ];
      }),
    );
    setState("ready");
  }

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) {
        setState("error");
        return;
      }
      setFamilyId(context.familyId);
      setUserId(context.userId);
      await refresh(context.familyId, context.userId);
    })();
  }, []);

  async function createInvite() {
    if (lock.current || !familyId || !userId || role === "viewer") return;
    lock.current = true;
    setPending("invite");
    setNote(null);
    try {
      const supabase = createClient();
      const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      const { data, error } = await supabase
        .from("invites")
        .insert({
          family_id: familyId,
          role: inviteRole,
          created_by: userId,
          expires_at: expiresAt,
          token,
        })
        .select("token")
        .single();
      if (error || !data?.token) {
        setNote(t("common.failed"));
        return;
      }
      const next = `${window.location.origin}/join/${data.token}`;
      setLink(next);
      setNote(t("family.created"));
      await refresh(familyId, userId);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function saveName() {
    if (lock.current || !userId || !familyId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    lock.current = true;
    setPending("name");
    setNote(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("family_members")
        .update({ display_name: trimmed })
        .eq("user_id", userId)
        .eq("family_id", familyId);
      setNote(error ? t("common.failed") : t("common.saved"));
      if (!error) await refresh(familyId, userId);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNote(t("family.copied"));
    } catch {
      setNote(value);
    }
  }

  return (
    <Screen titleKey="family.title" ledeKey="family.lede" showLater={false}>
      {state === "loading" ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("family.loading")}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="text-sm text-muted" role="alert">
          {t("family.error")}
        </p>
      ) : null}
      {state === "ready" ? (
        <>
          <BabyProfile />
          <ul className="flex flex-col gap-3">
            {members.map((member) => (
              <li key={member.id} className="rounded-3xl border border-line bg-card px-5 py-4">
                <h2 className="text-base font-semibold">{member.name || t(`family.${member.role}`)}</h2>
                <p className="mt-1 text-sm text-muted">{t(`family.${member.role}`)}</p>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="display-name">
            {t("family.yourName")}
            <input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-12 rounded-2xl border border-line bg-card px-3 text-base font-normal"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveName()}
            disabled={pending !== null}
            aria-busy={pending === "name"}
            className="min-h-12 rounded-2xl border border-line px-4 text-base font-semibold disabled:opacity-50"
          >
            {pending === "name" ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </button>
          {role && role !== "viewer" ? (
            <div className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
              <h2 className="text-sm font-semibold">{t("family.invite")}</h2>
              <p className="text-sm leading-6 text-muted">{t("family.invites")}</p>
              <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="invite-role">
                {t("family.role")}
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as "caregiver" | "viewer")}
                  className="min-h-12 rounded-2xl border border-line bg-background px-3 text-base font-normal"
                >
                  <option value="caregiver">{t("family.caregiver")}</option>
                  <option value="viewer">{t("family.viewer")}</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void createInvite()}
                disabled={pending !== null}
                aria-busy={pending === "invite"}
                className="min-h-12 rounded-2xl bg-accent px-4 text-base font-semibold text-accent-foreground disabled:opacity-50"
              >
                {pending === "invite" ? <SavingLabel label={t("common.saving")} /> : t("family.create")}
              </button>
              {link ? (
                <button type="button" onClick={() => void copy(link)} className="text-left text-sm font-semibold text-accent">
                  {link}
                </button>
              ) : null}
            </div>
          ) : null}
          {invites.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {invites.map((invite) => {
                const href = `/join/${invite.token}`;
                return (
                  <li key={invite.id} className="text-sm">
                    <span className="font-semibold">{t(`family.${invite.role}`)}</span>
                    <button
                      type="button"
                      onClick={() => void copy(`${window.location.origin}${href}`)}
                      className="ml-2 font-semibold text-accent"
                    >
                      {t("family.copy")}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="text-sm leading-6 text-muted">{t("family.ownerNote")}</p>
        </>
      ) : null}
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
    </Screen>
  );
}
