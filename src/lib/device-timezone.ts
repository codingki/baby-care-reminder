import { createClient } from "@/lib/supabase/client";

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function timeZoneOptions(current: string) {
  const supported =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? Intl.supportedValuesOf("timeZone")
      : [current];
  return supported.includes(current) ? supported : [current, ...supported];
}

export async function saveDeviceTimeZone(userId: string, familyId: string) {
  const zone = deviceTimeZone();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("member_settings")
    .select("timezone, timezone_manual")
    .eq("user_id", userId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (error || !data || data.timezone_manual || data.timezone === zone) return;
  await supabase
    .from("member_settings")
    .update({ timezone: zone })
    .eq("user_id", userId)
    .eq("family_id", familyId);
}
