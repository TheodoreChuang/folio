export type SeededPortfolio = {
  portfolioSummary: {
    properties: Array<{ id: string; address: string; nickname: string | null }>
    totalEquityCents: number
    blendedLvr: number
    totalValueCents: number
    totalDebtCents: number
  }
  properties: Array<{
    id: string
    address: string
    nickname: string | null
    grossYieldPercent: number
    netYieldPercent: number
    equityCents: number
    lvr: number
  }>
  loans: Array<{
    id: string
    lender: string
    nickname: string | null
    currentBalanceCents: number
    interestRatePct: number
    loanType: string
  }>
  cashflow: {
    totalRentCents: number
    totalExpensesCents: number
    totalMortgageCents: number
    netAfterMortgageCents: number
  }
  ledgerEntries: Array<{
    id: string
    date: string
    category: string
    amountCents: number
    description: string | null
  }>
}

export const STANDARD_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [
      { id: 'prop-001', address: '12 Acacia Ave, Melbourne VIC 3000', nickname: 'Acacia' },
      { id: 'prop-002', address: '7 Elm St, Sydney NSW 2000', nickname: 'Elm' },
    ],
    totalEquityCents: 42000000,
    blendedLvr: 0.65,
    totalValueCents: 120000000,
    totalDebtCents: 78000000,
  },
  properties: [
    {
      id: 'prop-001',
      address: '12 Acacia Ave, Melbourne VIC 3000',
      nickname: 'Acacia',
      grossYieldPercent: 4.2,
      netYieldPercent: 2.8,
      equityCents: 22000000,
      lvr: 0.60,
    },
    {
      id: 'prop-002',
      address: '7 Elm St, Sydney NSW 2000',
      nickname: 'Elm',
      grossYieldPercent: 3.8,
      netYieldPercent: 2.1,
      equityCents: 20000000,
      lvr: 0.70,
    },
  ],
  loans: [
    {
      id: 'loan-001',
      lender: 'ANZ',
      nickname: 'Acacia Loan',
      currentBalanceCents: 38000000,
      interestRatePct: 6.25,
      loanType: 'variable',
    },
    {
      id: 'loan-002',
      lender: 'CBA',
      nickname: 'Elm Loan',
      currentBalanceCents: 40000000,
      interestRatePct: 5.99,
      loanType: 'fixed',
    },
  ],
  cashflow: {
    totalRentCents: 360000,
    totalExpensesCents: 80000,
    totalMortgageCents: 200000,
    netAfterMortgageCents: 80000,
  },
  ledgerEntries: [
    { id: 'entry-001', date: '2026-05-01', category: 'rent', amountCents: 180000, description: 'May rent - Acacia' },
    { id: 'entry-002', date: '2026-05-01', category: 'rent', amountCents: 180000, description: 'May rent - Elm' },
    { id: 'entry-003', date: '2026-05-05', category: 'expense', amountCents: 40000, description: 'Rates - Acacia' },
  ],
}

export const EMPTY_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [],
    totalEquityCents: 0,
    blendedLvr: 0,
    totalValueCents: 0,
    totalDebtCents: 0,
  },
  properties: [],
  loans: [],
  cashflow: {
    totalRentCents: 0,
    totalExpensesCents: 0,
    totalMortgageCents: 0,
    netAfterMortgageCents: 0,
  },
  ledgerEntries: [],
}
