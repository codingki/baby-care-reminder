import { AppShell } from "@/components/app-shell";
import { ClientSession } from "@/components/client-session";
import { SyncQueue } from "@/components/sync-queue";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <SyncQueue />
      <ClientSession>{children}</ClientSession>
    </AppShell>
  );
}
