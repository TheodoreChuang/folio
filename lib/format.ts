import type { EntityType } from '@/db/schema'

export function entityTypeSubLabel(type: EntityType): string {
  switch (type) {
    case 'trust': return 'Discretionary trust'
    case 'individual': return 'Individual'
    case 'company': return 'Company'
    case 'joint': return 'Joint'
    case 'superannuation': return 'Superannuation'
  }
}

export function formatCentsEntered(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function formatMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return new Date(year, mon - 1).toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
  })
}

export function lastDayOfMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon, 0)
  return `${year}-${String(mon).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns the last `count` months from today, newest first, as 'YYYY-MM' strings.
export function recentMonths(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}
