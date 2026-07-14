import { SectionLabel } from '@/components/ui/section-label'

export function Default() {
  return (
    <div className="p-6 w-[280px]">
      <SectionLabel>Cashflow</SectionLabel>
      <div className="text-sm text-foreground-muted">Section content follows this label.</div>
    </div>
  )
}
