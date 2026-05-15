import { Sidebar } from '@/components/sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: '220px 1fr' }}>
      <Sidebar />
      <main className="min-w-0 bg-screen-bg">
        {children}
      </main>
    </div>
  )
}
