import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { SyncQueue } from "@/components/sync-queue";
import { RequireSession } from "@/components/require-session";
import { SessionFallback } from "@/components/session-fallback";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <SyncQueue />
      <Suspense fallback={<SessionFallback />}>
        <RequireSession>{children}</RequireSession>
      </Suspense>
    </AppShell>
  );
}
