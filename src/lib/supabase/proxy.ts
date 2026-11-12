import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { getSupabaseEnv } from "@/lib/supabase/env";

const PUBLIC_PREFIXES = ["/login", "/auth", "/shell-check"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copySession(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) {
      to.headers.set(header, value);
    }
  }

  return to;
}

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-bcr-pathname", request.nextUrl.pathname);

  const forward = () =>
    NextResponse.next({
      request: { headers: requestHeaders },
    });

  let supabaseResponse = forward();
  const { url, key } = getSupabaseEnv();

  // A new client per request. Do not store this in a global on Fluid Compute.
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        requestHeaders.set("cookie", request.cookies.toString());
        supabaseResponse = forward();
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([header, value]) => {
          supabaseResponse.headers.set(header, value);
        });
      },
    },
  });

  // Keep this call immediately after createServerClient. It refreshes the
  // auth cookies and verifies the token. Do not trust getSession() here.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    redirectUrl.searchParams.set("next", safeNextPath(destination));
    return copySession(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (signedIn && userId && !isPublicPath(request.nextUrl.pathname)) {
    const pathname = request.nextUrl.pathname;
    const joining = pathname === "/join" || pathname.startsWith("/join/");
    const setupPath = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
    const editing = setupPath && request.nextUrl.searchParams.get("mode") === "edit";
    if (!joining) {
      const finished = await setupFinished(supabase, userId);
      if (!finished && !setupPath && isCarePath(pathname)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/onboarding";
        redirectUrl.search = "";
        return copySession(supabaseResponse, NextResponse.redirect(redirectUrl));
      }
      if (finished && setupPath && !editing) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        redirectUrl.search = "";
        return copySession(supabaseResponse, NextResponse.redirect(redirectUrl));
      }
    }
  }

  return supabaseResponse;
}

function isCarePath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/chiller" ||
    pathname.startsWith("/chiller/") ||
    pathname === "/insights" ||
    pathname.startsWith("/insights/") ||
    pathname === "/family" ||
    pathname.startsWith("/family/") ||
    pathname === "/timeline" ||
    pathname.startsWith("/timeline/") ||
    pathname === "/log" ||
    pathname.startsWith("/log/") ||
    pathname === "/bottles" ||
    pathname.startsWith("/bottles/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

async function setupFinished(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("family_members")
    .select("family_id, families!inner(babies(id)), member_settings(onboarding_step)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error || !data?.family_id) {
    if (error && /onboarding_step|member_settings|babies/.test(error.message)) return true;
    return false;
  }
  const family = data.families as { babies?: { id: string }[] | { id: string } | null } | { babies?: { id: string }[] | { id: string } | null }[] | null;
  const familyRow = Array.isArray(family) ? family[0] : family;
  const babies = familyRow?.babies;
  const hasBaby = Array.isArray(babies) ? babies.length > 0 : Boolean(babies && "id" in babies);
  if (!hasBaby) return false;
  const settings = data.member_settings as { onboarding_step?: number } | { onboarding_step?: number }[] | null;
  const settingsRow = Array.isArray(settings) ? settings[0] : settings;
  const step = typeof settingsRow?.onboarding_step === "number" ? settingsRow.onboarding_step : 7;
  return step >= 7;
}
