import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { RequireSession } from "@/components/require-session";
import { SessionFallback } from "@/components/session-fallback";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<SessionFallback />}>
        <RequireSession>{children}</RequireSession>
      </Suspense>
    </AppShell>
  );
}
