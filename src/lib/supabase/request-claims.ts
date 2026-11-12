import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getRequestClaims = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return data?.claims ?? null;
});
