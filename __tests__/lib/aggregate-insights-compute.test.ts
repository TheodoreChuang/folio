import { describe, it, expect } from 'vitest'
import { computeReturn } from '@/lib/aggregate/services/compute'

describe('computeReturn', () => {
  it('full data: computes all metrics correctly', () => {
    const result = computeReturn({
      endValuations:   [{ valueCents: 207_000_000 }],
      startValuations: [{ valueCents: 195_600_000 }],
      periodRentCents: 9_190_800,
      periodMonths:    12,
    })
    expect(result.currentValueCents).toBe(207_000_000)
    expect(result.annualisedRentCents).toBe(9_190_800)
    expect(result.grossYieldPct).toBe(4.44)
    expect(result.capitalGrowthPct).toBe(5.83)
    expect(result.capitalGrowthCents).toBe(11_400_000)
    expect(result.totalReturnPct).toBe(10.27)
  })

  it('empty startValuations + non-empty endValuations → capitalGrowthPct null, totalReturnPct null, grossYieldPct computed', () => {
    const result = computeReturn({
      endValuations:   [{ valueCents: 207_000_000 }],
      startValuations: [],
      periodRentCents: 9_190_800,
      periodMonths:    12,
    })
    expect(result.capitalGrowthPct).toBeNull()
    expect(result.capitalGrowthCents).toBeNull()
    expect(result.totalReturnPct).toBeNull()
    expect(result.grossYieldPct).toBe(4.44)
  })

  it('both empty → grossYieldPct null, capitalGrowthPct null, totalReturnPct null', () => {
    const result = computeReturn({
      endValuations:   [],
      startValuations: [],
      periodRentCents: 0,
      periodMonths:    12,
    })
    expect(result.grossYieldPct).toBeNull()
    expect(result.capitalGrowthPct).toBeNull()
    expect(result.totalReturnPct).toBeNull()
  })

  it('periodRentCents = 0 → grossYieldPct = 0 (not null) when value is known', () => {
    const result = computeReturn({
      endValuations:   [{ valueCents: 207_000_000 }],
      startValuations: [{ valueCents: 195_600_000 }],
      periodRentCents: 0,
      periodMonths:    12,
    })
    expect(result.grossYieldPct).toBe(0)
    expect(result.annualisedRentCents).toBe(0)
  })

  it('periodMonths = 0 → annualisedRentCents = 0 (no division by zero)', () => {
    const result = computeReturn({
      endValuations:   [{ valueCents: 207_000_000 }],
      startValuations: [{ valueCents: 195_600_000 }],
      periodRentCents: 5_000_000,
      periodMonths:    0,
    })
    expect(result.annualisedRentCents).toBe(0)
    expect(result.grossYieldPct).toBe(0)
  })

  it('multi-property: valuations are summed', () => {
    const result = computeReturn({
      endValuations:   [{ valueCents: 100_000_000 }, { valueCents: 107_000_000 }],
      startValuations: [{ valueCents: 95_000_000 }, { valueCents: 100_600_000 }],
      periodRentCents: 9_190_800,
      periodMonths:    12,
    })
    expect(result.currentValueCents).toBe(207_000_000)
    expect(result.grossYieldPct).toBe(4.44)
    // capitalGrowth: (207M - 195.6M) / 195.6M * 100
    expect(result.capitalGrowthPct).toBe(5.83)
    expect(result.capitalGrowthCents).toBe(11_400_000)
  })

  it('annualises rent correctly for non-12-month period', () => {
    // 6 months of rent → annualised is doubled
    const result = computeReturn({
      endValuations:   [{ valueCents: 500_000_00 }],
      startValuations: [{ valueCents: 490_000_00 }],
      periodRentCents: 2_000_00, // $2000 over 6 months
      periodMonths:    6,
    })
    expect(result.annualisedRentCents).toBe(4_000_00) // $4000/year
  })
})
