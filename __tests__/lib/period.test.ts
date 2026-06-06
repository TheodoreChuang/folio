import { describe, it, expect } from 'vitest'
import { periodToDateRange, periodMeta } from '@/lib/period'

const JUN_6_2026  = new Date(2026, 5, 6)   // June 6, 2026 (month 0-indexed)
const AUG_1_2026  = new Date(2026, 7, 1)   // August 1, 2026

describe('periodToDateRange', () => {
  it('12m on 2026-06-06 → from 2025-06-01 to 2026-06-30', () => {
    expect(periodToDateRange('12m', JUN_6_2026)).toEqual({
      from: '2025-06-01',
      to:   '2026-06-30',
    })
  })

  it('6m on 2026-06-06 → from 2025-12-01 to 2026-06-30', () => {
    expect(periodToDateRange('6m', JUN_6_2026)).toEqual({
      from: '2025-12-01',
      to:   '2026-06-30',
    })
  })

  it('this-fy on 2026-06-06 (month < 7) → from 2025-07-01 to 2026-06-30', () => {
    expect(periodToDateRange('this-fy', JUN_6_2026)).toEqual({
      from: '2025-07-01',
      to:   '2026-06-30',
    })
  })

  it('this-fy on 2026-08-01 (month >= 7) → from 2026-07-01 to 2027-06-30', () => {
    expect(periodToDateRange('this-fy', AUG_1_2026)).toEqual({
      from: '2026-07-01',
      to:   '2027-06-30',
    })
  })

  it('last-fy on 2026-06-06 → from 2024-07-01 to 2025-06-30', () => {
    expect(periodToDateRange('last-fy', JUN_6_2026)).toEqual({
      from: '2024-07-01',
      to:   '2025-06-30',
    })
  })

  it('all-time → from 2000-01-01, to is today', () => {
    const result = periodToDateRange('all-time', JUN_6_2026)
    expect(result.from).toBe('2000-01-01')
    expect(result.to).toBe('2026-06-06')
  })
})

describe('periodMeta', () => {
  it('12m → Rolling', () => {
    expect(periodMeta('12m')).toBe('Rolling')
  })

  it('6m → Rolling', () => {
    expect(periodMeta('6m')).toBe('Rolling')
  })

  it('last-fy → undefined', () => {
    expect(periodMeta('last-fy')).toBeUndefined()
  })

  it('this-fy → undefined', () => {
    expect(periodMeta('this-fy')).toBeUndefined()
  })

  it('all-time → undefined', () => {
    expect(periodMeta('all-time')).toBeUndefined()
  })
})
