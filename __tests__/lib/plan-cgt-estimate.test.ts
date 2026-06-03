import { describe, it, expect } from 'vitest'
import { computeCgtEstimate, type CgtEstimateInputs } from '@/lib/aggregate/plan/calculators/cgt-estimate'

const cents = (aud: number) => Math.round(aud * 100)

function base(overrides: Partial<CgtEstimateInputs> = {}): CgtEstimateInputs {
  return {
    salePriceCents: cents(640_000),
    purchasePriceCents: cents(430_000),
    costsCents: {
      stampDuty: cents(14_800),
      legal: cents(1_600),
      buildingPest: cents(500),
      buyerAgent: 0,
      improvements: cents(28_000),
    },
    sellingCostsTotalCents: cents(22_580), // agent 2.2% + marketing + legal
    depreciationCents: cents(12_000),
    discountPct: 50,
    marginalRatePct: 37,
    ...overrides,
  }
}

describe('computeCgtEstimate', () => {
  it('computes cost base from purchase price + acquisition costs + selling costs', () => {
    const result = computeCgtEstimate(base())
    // 430k + (14.8k + 1.6k + 0.5k + 0 + 28k) + 22.58k = 497.48k
    expect(result.costBaseCents).toBe(cents(430_000 + 14_800 + 1_600 + 500 + 28_000 + 22_580))
  })

  it('computes raw gain as sale price minus cost base', () => {
    const result = computeCgtEstimate(base())
    expect(result.rawGainCents).toBe(result.costBaseCents ? cents(640_000) - result.costBaseCents : 0)
    expect(result.rawGainCents).toBe(cents(640_000) - result.costBaseCents)
  })

  it('adds depreciation back to the gain', () => {
    const result = computeCgtEstimate(base())
    expect(result.grossGainCents).toBe(result.rawGainCents + cents(12_000))
  })

  it('applies CGT discount to assessable gain', () => {
    const result = computeCgtEstimate(base())
    expect(result.discountAmountCents).toBe(Math.round(result.assessableGainCents * 0.5))
    expect(result.netCapitalGainCents).toBe(result.assessableGainCents - result.discountAmountCents)
  })

  it('applies marginal rate to net capital gain', () => {
    const result = computeCgtEstimate(base())
    expect(result.estimatedCgtCents).toBe(Math.round(result.netCapitalGainCents * 0.37))
  })

  it('is not a capital loss when gain is positive', () => {
    const result = computeCgtEstimate(base())
    expect(result.isCapitalLoss).toBe(false)
  })

  it('detects a capital loss when gross gain is negative', () => {
    const result = computeCgtEstimate(
      base({
        salePriceCents: cents(300_000), // well below cost base
        depreciationCents: 0,
      }),
    )
    expect(result.isCapitalLoss).toBe(true)
    expect(result.assessableGainCents).toBe(0)
    expect(result.estimatedCgtCents).toBe(0)
  })

  it('clamps assessable gain at zero (no negative tax)', () => {
    const result = computeCgtEstimate(
      base({
        salePriceCents: cents(200_000),
        depreciationCents: 0,
      }),
    )
    expect(result.assessableGainCents).toBe(0)
    expect(result.estimatedCgtCents).toBe(0)
  })

  it('handles zero discount (no CGT discount)', () => {
    const result = computeCgtEstimate(base({ discountPct: 0 }))
    expect(result.discountAmountCents).toBe(0)
    expect(result.netCapitalGainCents).toBe(result.assessableGainCents)
  })

  it('handles zero marginal rate', () => {
    const result = computeCgtEstimate(base({ marginalRatePct: 0 }))
    expect(result.estimatedCgtCents).toBe(0)
  })

  it('handles zero depreciation', () => {
    const result = computeCgtEstimate(base({ depreciationCents: 0 }))
    expect(result.grossGainCents).toBe(result.rawGainCents)
  })

  it('handles all zero costs', () => {
    const result = computeCgtEstimate(
      base({
        costsCents: { stampDuty: 0, legal: 0, buildingPest: 0, buyerAgent: 0, improvements: 0 },
        sellingCostsTotalCents: 0,
        depreciationCents: 0,
      }),
    )
    expect(result.costBaseCents).toBe(cents(430_000))
    expect(result.rawGainCents).toBe(cents(640_000) - cents(430_000))
  })

  it('produces a zero-CGT result when sale price equals purchase price with no extras', () => {
    const result = computeCgtEstimate({
      salePriceCents: cents(500_000),
      purchasePriceCents: cents(500_000),
      costsCents: { stampDuty: 0, legal: 0, buildingPest: 0, buyerAgent: 0, improvements: 0 },
      sellingCostsTotalCents: 0,
      depreciationCents: 0,
      discountPct: 50,
      marginalRatePct: 37,
    })
    expect(result.isCapitalLoss).toBe(false)
    expect(result.grossGainCents).toBe(0)
    expect(result.estimatedCgtCents).toBe(0)
  })
})
