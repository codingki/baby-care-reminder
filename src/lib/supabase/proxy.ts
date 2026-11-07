import { createServerClient } from "@supabase/ssr";
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

  return supabaseResponse;
}
