export type PeriodKey = '12m' | '6m' | 'this-fy' | 'last-fy' | 'all-time'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDate(dateString: string): string {
  const [y, m, day] = dateString.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function periodToDateRange(period: PeriodKey, now?: Date): { from: string; to: string } {
  const d = now ?? new Date()
  const year = d.getFullYear()
  const month = d.getMonth() + 1 // 1-indexed

  if (period === '12m' || period === '6m') {
    const n = period === '12m' ? 12 : 6
    const start = new Date(year, month - 1 - n, 1)
    const sy = start.getFullYear()
    const sm = pad(start.getMonth() + 1)
    const endDay = new Date(year, month, 0).getDate()
    return {
      from: `${sy}-${sm}-01`,
      to: `${year}-${pad(month)}-${endDay}`,
    }
  }

  if (period === 'all-time') {
    return { from: '2000-01-01', to: dateStr(d) }
  }

  const fyStartYear = month >= 7 ? year : year - 1
  if (period === 'this-fy') {
    return { from: `${fyStartYear}-07-01`, to: `${fyStartYear + 1}-06-30` }
  }
  // last-fy
  return { from: `${fyStartYear - 1}-07-01`, to: `${fyStartYear}-06-30` }
}

export function periodLabel(period: PeriodKey): string {
  switch (period) {
    case '12m':     return 'Last 12 months'
    case '6m':      return 'Last 6 months'
    case 'this-fy': return 'This financial year'
    case 'last-fy': return 'Last financial year'
    case 'all-time': return 'All time'
  }
}

export function periodSubtitle(period: PeriodKey, now?: Date): string {
  if (period === 'all-time') return 'All time'
  const { from, to } = periodToDateRange(period, now)
  const fromStr = formatDate(from)
  const toStr = formatDate(to)
  switch (period) {
    case '12m':     return `Trailing 12 months · ${fromStr} – ${toStr}`
    case '6m':      return `Trailing 6 months · ${fromStr} – ${toStr}`
    case 'this-fy': return `Financial year to date · ${fromStr} – ${toStr}`
    case 'last-fy': return `Financial year · ${fromStr} – ${toStr}`
  }
}

export function periodMeta(period: PeriodKey): string | undefined {
  return period === '12m' || period === '6m' ? 'Rolling' : undefined
}

export function periodMonthCount(period: PeriodKey, now?: Date): number {
  if (period === '12m') return 12
  if (period === '6m') return 6
  if (period === 'this-fy' || period === 'last-fy') return 12
  // all-time: months elapsed since 2000-01-01
  const d = now ?? new Date()
  return (d.getFullYear() - 2000) * 12 + (d.getMonth() + 1)
}
