import "server-only";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next-path";
import { getRequestClaims } from "@/lib/supabase/request-claims";

export async function RequireSession({ children }: { children: React.ReactNode }) {
  try {
    const claims = await getRequestClaims();
    if (!claims) {
      const headerStore = await headers();
      const next = safeNextPath(headerStore.get("x-bcr-pathname"));
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
  } catch (error) {
    unstable_rethrow(error);
    redirect("/login");
  }

  return children;
}
