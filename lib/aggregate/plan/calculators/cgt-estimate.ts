export type CgtEstimateInputs = {
  salePriceCents: number
  purchasePriceCents: number
  costsCents: {
    stampDuty: number
    legal: number
    buildingPest: number
    buyerAgent: number
    improvements: number
  }
  sellingCostsTotalCents: number
  depreciationCents: number
  discountPct: number
  marginalRatePct: number
}

export type CgtEstimateResult = {
  costBaseCents: number
  rawGainCents: number
  grossGainCents: number
  isCapitalLoss: boolean
  assessableGainCents: number
  discountAmountCents: number
  netCapitalGainCents: number
  estimatedCgtCents: number
}

export function computeCgtEstimate(inputs: CgtEstimateInputs): CgtEstimateResult {
  const { salePriceCents, purchasePriceCents, costsCents, sellingCostsTotalCents, depreciationCents, discountPct, marginalRatePct } = inputs

  const acquisitionCostsCents =
    costsCents.stampDuty +
    costsCents.legal +
    costsCents.buildingPest +
    costsCents.buyerAgent +
    costsCents.improvements

  // Cost base = purchase price + acquisition/improvement costs + selling costs
  const costBaseCents = purchasePriceCents + acquisitionCostsCents + sellingCostsTotalCents

  const rawGainCents = salePriceCents - costBaseCents

  // Div 40 depreciation is added back (it reduced the cost base over the hold)
  const grossGainCents = rawGainCents + depreciationCents

  const isCapitalLoss = grossGainCents < 0
  const assessableGainCents = Math.max(0, grossGainCents)

  const discountAmountCents = Math.round(assessableGainCents * (discountPct / 100))
  const netCapitalGainCents = Math.max(0, assessableGainCents - discountAmountCents)
  const estimatedCgtCents = Math.round(netCapitalGainCents * (marginalRatePct / 100))

  return {
    costBaseCents,
    rawGainCents,
    grossGainCents,
    isCapitalLoss,
    assessableGainCents,
    discountAmountCents,
    netCapitalGainCents,
    estimatedCgtCents,
  }
}
