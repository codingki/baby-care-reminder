import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/server";

type LoginSearch = {
  next?: string | string[];
  error?: string | string[];
};

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearch>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" aria-busy="true" />}>
      <LoginGate searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginGate({ searchParams }: { searchParams: Promise<LoginSearch> }) {
  const params = await searchParams;
  const nextPath = safeNextPath(first(params.next));
  let signedIn = false;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  } catch (error) {
    unstable_rethrow(error);
  }

  if (signedIn) redirect(nextPath);

  return <LoginForm nextPath={nextPath} authError={first(params.error) === "auth"} />;
}
