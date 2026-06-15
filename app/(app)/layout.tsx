import { SidebarProvider } from '@/components/sidebar-context'
import { AppShell } from '@/components/app-shell'
import { AssistantDock } from '@/components/assistant/assistant-dock'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShell>{children}</AppShell>
      <AssistantDock />
    </SidebarProvider>
  )
}
