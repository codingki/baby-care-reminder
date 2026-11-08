"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionHeading } from "@/components/care-icon";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/provider";
import { scopedKey, scopeFromKey, useScope } from "@/lib/care-queries";
import { createClient } from "@/lib/supabase/client";

export function FamilyActivitySwitch() {
  const { t } = useI18n();
  const scope = useScope();
  const queryClient = useQueryClient();
  const queryKey = scopedKey("family-activity", scope.data);
  const activityQuery = useQuery({
    queryKey,
    enabled: Boolean(scope.data?.userId && scope.data.familyId),
    queryFn: async ({ queryKey: key }) => {
      const selected = scopeFromKey(key);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("member_settings")
        .select("notify_family_activity")
        .eq("user_id", selected.userId)
        .eq("family_id", selected.familyId)
        .maybeSingle();
      if (error) throw error;
      return data?.notify_family_activity !== false;
    },
  });

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      const selected = scope.data;
      if (!selected) throw new Error("missing scope");
      const supabase = createClient();
      const { error } = await supabase
        .from("member_settings")
        .update({ notify_family_activity: next })
        .eq("user_id", selected.userId)
        .eq("family_id", selected.familyId);
      if (error) throw error;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context && "previous" in context) queryClient.setQueryData(queryKey, context.previous);
      toast(t("common.failed"));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const checked = activityQuery.data ?? true;

  return (
    <Card className="gap-3 p-4">
      <label className="flex min-h-12 items-center justify-between gap-3">
        <span className="min-w-0">
          <SectionHeading icon="bell">{t("settings.familyActivity")}</SectionHeading>
          <span className="mt-1 block text-sm font-normal leading-6 text-muted">{t("settings.familyActivityHint")}</span>
        </span>
        <Switch
          checked={checked}
          disabled={!scope.data || activityQuery.isPending}
          onCheckedChange={(next) => save.mutate(next)}
          aria-label={t("settings.familyActivity")}
          className="h-6 w-11"
        />
      </label>
    </Card>
  );
}
