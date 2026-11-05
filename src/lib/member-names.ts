import { createClient } from "@/lib/supabase/client";

export async function loadMemberNames(familyId: string): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("family_members")
    .select("user_id, display_name")
    .eq("family_id", familyId);
  const names: Record<string, string> = {};
  for (const member of data ?? []) {
    if (typeof member.user_id === "string" && typeof member.display_name === "string") {
      names[member.user_id] = member.display_name;
    }
  }
  return names;
}
