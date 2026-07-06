import type { badgeVariants } from '@/components/ui/badge'
import type { SourceDocument } from '@/db/schema'
import type { VariantProps } from 'class-variance-authority'

export const STATUS_META: Record<SourceDocument['status'], { label: string; badgeVariant: VariantProps<typeof badgeVariants>['variant'] }> = {
  pending: { label: 'Pending', badgeVariant: 'partial' },
  confirmed: { label: 'Confirmed', badgeVariant: 'complete' },
  voided: { label: 'Voided', badgeVariant: 'neutral' },
  dismissed: { label: 'Dismissed', badgeVariant: 'neutral' },
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
