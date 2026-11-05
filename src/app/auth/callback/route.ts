import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>(["email", "magiclink", "signup", "invite"]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && EMAIL_OTP_TYPES.has(value as EmailOtpType);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(nextPath, url.origin));
  } else if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) return NextResponse.redirect(new URL(nextPath, url.origin));
  }

  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("error", "auth");
  if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}
