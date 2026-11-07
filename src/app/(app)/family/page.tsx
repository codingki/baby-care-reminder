"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SavingLabel } from "@/components/saving-label";
import { BabyProfile } from "@/components/baby-profile";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/provider";
import { scopeFromKey, scopedKey, useScope } from "@/lib/care-queries";
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
  const [inviteRole, setInviteRole] = useState<"caregiver" | "viewer">("caregiver");
  const [link, setLink] = useState<string | null>(null);
  const [nameDraft, setName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const scope = useScope();
  const queryClient = useQueryClient();
  const familyQuery = useQuery({
    queryKey: scopedKey("family", scope.data),
    enabled: Boolean(scope.data?.userId && scope.data.familyId),
    queryFn: ({ queryKey }) => {
      const selected = scopeFromKey(queryKey);
      return refresh(selected.familyId, selected.userId, selected.babyId);
    },
  });
  const state = familyQuery.data ? "ready" : familyQuery.isPending ? "loading" : "error";
  const [pending, setPending] = useState<"name" | "invite" | null>(null);
  const lock = useRef(false);

  async function refresh(currentFamilyId: string, currentUserId: string, babyId: string | null) {
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
    if (memberResult.error) return null;
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
    const mine = nextMembers.find((member) => member.userId === currentUserId);
    return {
      userId: currentUserId,
      familyId: currentFamilyId,
      babyId,
      members: nextMembers,
      role: mine?.role ?? null,
      name: mine?.name ?? "",
      invites:
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
    };
  }

  const name = nameDraft ?? familyQuery.data?.name ?? "";
  const members = familyQuery.data?.members ?? [];
  const invites = familyQuery.data?.invites ?? [];
  const role = familyQuery.data?.role ?? null;
  const userId = familyQuery.data?.userId ?? null;
  const familyId = familyQuery.data?.familyId ?? null;

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
      await queryClient.invalidateQueries({ queryKey: ["family"] });
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
      if (!error) await queryClient.invalidateQueries({ queryKey: ["family"] });
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
              <li key={member.id}>
                <Card className="gap-1 px-5 py-4">
                <h2 className="text-base font-semibold">{member.name || t(`family.${member.role as Member["role"]}`)}</h2>
                <p className="text-sm text-muted">{t(`family.${member.role as Member["role"]}`)}</p>
                </Card>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-2 text-sm font-semibold" htmlFor="display-name">
            {t("family.yourName")}
            <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} className="px-3" />
          </label>
          <Button type="button" variant="outline" onClick={() => void saveName()} disabled={pending !== null} aria-busy={pending === "name"}>
            {pending === "name" ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </Button>
          {role && role !== "viewer" ? (
            <Card className="gap-3 p-4">
              <h2 className="text-sm font-semibold">{t("family.invite")}</h2>
              <p className="text-sm leading-6 text-muted">{t("family.invites")}</p>
              <div className="flex flex-col gap-2 text-sm font-semibold">
                <label htmlFor="invite-role">{t("family.role")}</label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => {
                    if (value === "caregiver" || value === "viewer") setInviteRole(value);
                  }}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="caregiver">{t("family.caregiver")}</SelectItem>
                    <SelectItem value="viewer">{t("family.viewer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={() => void createInvite()} disabled={pending !== null} aria-busy={pending === "invite"}>
                {pending === "invite" ? <SavingLabel label={t("common.saving")} /> : t("family.create")}
              </Button>
              {link ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-h-0 justify-start px-0 text-left text-sm whitespace-normal"
                  onClick={() => void copy(link)}
                >
                  {link}
                </Button>
              ) : null}
            </Card>
          ) : null}
          {invites.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {invites.map((invite) => {
                const href = `/join/${invite.token}`;
                return (
                  <li key={invite.id} className="text-sm">
                    <span className="font-semibold">{t(`family.${invite.role as Invite["role"]}`)}</span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-2 h-auto min-h-0 px-0 text-sm"
                      onClick={() => void copy(`${window.location.origin}${href}`)}
                    >
                      {t("family.copy")}
                    </Button>
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
