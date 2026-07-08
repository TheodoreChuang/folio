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
    saleDate: string | null
  }>
  loans: Array<{
    id: string
    lender: string
    nickname: string | null
    currentBalanceCents: number
    interestRatePct: number
    loanType: string
    endDate: string | null
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
  entities: Array<{ id: string; name: string }>
  propertyLifecycle: Record<string, {
    tenancies: unknown[]
    managementAgents: unknown[]
    activeManagementAgent: { id: string; agencyName: string } | null
    loans: Array<{ id: string; lender: string; endDate: string | null }>
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
      saleDate: null,
    },
    {
      id: 'prop-002',
      address: '7 Elm St, Sydney NSW 2000',
      nickname: 'Elm',
      grossYieldPercent: 3.8,
      netYieldPercent: 2.1,
      equityCents: 20000000,
      lvr: 0.70,
      saleDate: null,
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
      endDate: null,
    },
    {
      id: 'loan-002',
      lender: 'CBA',
      nickname: 'Elm Loan',
      currentBalanceCents: 40000000,
      interestRatePct: 5.99,
      loanType: 'fixed',
      endDate: null,
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
  entities: [
    { id: 'entity-001', name: 'Anderson Family Trust' },
  ],
  propertyLifecycle: {
    'prop-001': {
      tenancies: [],
      managementAgents: [],
      activeManagementAgent: { id: 'agent-001', agencyName: 'Melbourne Property Partners' },
      loans: [{ id: 'loan-001', lender: 'ANZ', endDate: null }],
    },
    'prop-002': {
      tenancies: [],
      managementAgents: [],
      activeManagementAgent: { id: 'agent-002', agencyName: 'Sydney Rentals Co' },
      loans: [{ id: 'loan-002', lender: 'CBA', endDate: null }],
    },
  },
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
  entities: [],
  propertyLifecycle: {},
}

// Entity already exists, no property yet — AE1's "already has an entity" precondition.
export const ENTITY_ONLY_PORTFOLIO: SeededPortfolio = {
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
  entities: [
    { id: 'entity-001', name: 'Smith Family Trust' },
  ],
  propertyLifecycle: {},
}

// A property with no loan at all — AE4's loan-free sale case, AE7's add-loan case.
export const UNENCUMBERED_PROPERTY_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [
      { id: 'prop-101', address: '5 Baker St, Perth WA 6000', nickname: 'Baker' },
    ],
    totalEquityCents: 9000000,
    blendedLvr: 0,
    totalValueCents: 9000000,
    totalDebtCents: 0,
  },
  properties: [
    {
      id: 'prop-101',
      address: '5 Baker St, Perth WA 6000',
      nickname: 'Baker',
      grossYieldPercent: 4.5,
      netYieldPercent: 3.1,
      equityCents: 9000000,
      lvr: 0,
      saleDate: null,
    },
  ],
  loans: [],
  cashflow: {
    totalRentCents: 30000,
    totalExpensesCents: 5000,
    totalMortgageCents: 0,
    netAfterMortgageCents: 25000,
  },
  ledgerEntries: [],
  entities: [
    { id: 'entity-101', name: 'Baker Family Trust' },
  ],
  propertyLifecycle: {
    'prop-101': {
      tenancies: [],
      managementAgents: [],
      activeManagementAgent: { id: 'agent-101', agencyName: 'Perth Property Managers' },
      loans: [],
    },
  },
}

// A property with exactly one loan that has no endDate — AE2's refinance case,
// AE4's encumbered-sale case.
export const ENCUMBERED_PROPERTY_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [
      { id: 'prop-201', address: '9 Oak Rd, Brisbane QLD 4000', nickname: 'Oak' },
    ],
    totalEquityCents: 5000000,
    blendedLvr: 0.55,
    totalValueCents: 11000000,
    totalDebtCents: 6000000,
  },
  properties: [
    {
      id: 'prop-201',
      address: '9 Oak Rd, Brisbane QLD 4000',
      nickname: 'Oak',
      grossYieldPercent: 4.0,
      netYieldPercent: 2.6,
      equityCents: 5000000,
      lvr: 0.55,
      saleDate: null,
    },
  ],
  loans: [
    {
      id: 'loan-201',
      lender: 'Westpac',
      nickname: 'Oak Loan',
      currentBalanceCents: 6000000,
      interestRatePct: 6.1,
      loanType: 'variable',
      endDate: null,
    },
  ],
  cashflow: {
    totalRentCents: 32000,
    totalExpensesCents: 6000,
    totalMortgageCents: 18000,
    netAfterMortgageCents: 8000,
  },
  ledgerEntries: [],
  entities: [
    { id: 'entity-201', name: 'Oak Investments Pty Ltd' },
  ],
  propertyLifecycle: {
    'prop-201': {
      tenancies: [],
      managementAgents: [],
      activeManagementAgent: { id: 'agent-201', agencyName: 'Brisbane Rentals Co' },
      loans: [{ id: 'loan-201', lender: 'Westpac', endDate: null }],
    },
  },
}

// A property with exactly one loan that already HAS an endDate set — the sibling of
// AE4/AE2 that must NOT get a close-loan step. Regression fixture for the manually-found
// bug where an already-closed loan still produced a close-loan step.
export const LOAN_ALREADY_CLOSED_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [
      { id: 'prop-301', address: '3 Cedar Ct, Adelaide SA 5000', nickname: 'Cedar' },
    ],
    totalEquityCents: 7000000,
    blendedLvr: 0.4,
    totalValueCents: 10000000,
    totalDebtCents: 3000000,
  },
  properties: [
    {
      id: 'prop-301',
      address: '3 Cedar Ct, Adelaide SA 5000',
      nickname: 'Cedar',
      grossYieldPercent: 4.1,
      netYieldPercent: 2.7,
      equityCents: 7000000,
      lvr: 0.4,
      saleDate: null,
    },
  ],
  loans: [
    {
      id: 'loan-301',
      lender: 'NAB',
      nickname: 'Cedar Loan',
      currentBalanceCents: 0,
      interestRatePct: 5.8,
      loanType: 'fixed',
      endDate: '2026-01-15',
    },
  ],
  cashflow: {
    totalRentCents: 28000,
    totalExpensesCents: 5000,
    totalMortgageCents: 0,
    netAfterMortgageCents: 23000,
  },
  ledgerEntries: [],
  entities: [
    { id: 'entity-301', name: 'Cedar Holdings Trust' },
  ],
  propertyLifecycle: {
    'prop-301': {
      tenancies: [],
      managementAgents: [],
      activeManagementAgent: { id: 'agent-301', agencyName: 'Adelaide Property Group' },
      loans: [{ id: 'loan-301', lender: 'NAB', endDate: '2026-01-15' }],
    },
  },
}

// A property with no currently-active management agent (lapsed) — AE6's PM-switch case.
export const PM_LAPSED_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [
      { id: 'prop-501', address: '21 Maple Dr, Hobart TAS 7000', nickname: 'Maple' },
    ],
    totalEquityCents: 6000000,
    blendedLvr: 0.5,
    totalValueCents: 9500000,
    totalDebtCents: 3500000,
  },
  properties: [
    {
      id: 'prop-501',
      address: '21 Maple Dr, Hobart TAS 7000',
      nickname: 'Maple',
      grossYieldPercent: 4.3,
      netYieldPercent: 2.9,
      equityCents: 6000000,
      lvr: 0.5,
      saleDate: null,
    },
  ],
  loans: [
    {
      id: 'loan-501',
      lender: 'Suncorp',
      nickname: 'Maple Loan',
      currentBalanceCents: 3500000,
      interestRatePct: 6.4,
      loanType: 'variable',
      endDate: null,
    },
  ],
  cashflow: {
    totalRentCents: 27000,
    totalExpensesCents: 5000,
    totalMortgageCents: 16000,
    netAfterMortgageCents: 6000,
  },
  ledgerEntries: [],
  entities: [
    { id: 'entity-501', name: 'Maple Street Trust' },
  ],
  propertyLifecycle: {
    'prop-501': {
      tenancies: [],
      managementAgents: [{ id: 'agent-500', agencyName: 'Prior Hobart PM', endDate: '2026-01-01' }],
      activeManagementAgent: null,
      loans: [{ id: 'loan-501', lender: 'Suncorp', endDate: null }],
    },
  },
}

// A property with two loans from the same lender and no data-driven discriminator
// between them — AE10's ambiguous-refinance case.
export const SAME_LENDER_LOANS_PORTFOLIO: SeededPortfolio = {
  portfolioSummary: {
    properties: [
      { id: 'prop-601', address: '14 Birch Ln, Canberra ACT 2600', nickname: 'Birch' },
    ],
    totalEquityCents: 4000000,
    blendedLvr: 0.6,
    totalValueCents: 10000000,
    totalDebtCents: 6000000,
  },
  properties: [
    {
      id: 'prop-601',
      address: '14 Birch Ln, Canberra ACT 2600',
      nickname: 'Birch',
      grossYieldPercent: 4.0,
      netYieldPercent: 2.5,
      equityCents: 4000000,
      lvr: 0.6,
      saleDate: null,
    },
  ],
  loans: [
    {
      id: 'loan-601',
      lender: 'Westpac',
      nickname: null,
      currentBalanceCents: 3000000,
      interestRatePct: 6.2,
      loanType: 'variable',
      endDate: null,
    },
    {
      id: 'loan-602',
      lender: 'Westpac',
      nickname: null,
      currentBalanceCents: 3000000,
      interestRatePct: 6.2,
      loanType: 'variable',
      endDate: null,
    },
  ],
  cashflow: {
    totalRentCents: 29000,
    totalExpensesCents: 5000,
    totalMortgageCents: 17000,
    netAfterMortgageCents: 7000,
  },
  ledgerEntries: [],
  entities: [
    { id: 'entity-601', name: 'Birch Lane Trust' },
  ],
  propertyLifecycle: {
    'prop-601': {
      tenancies: [],
      managementAgents: [],
      activeManagementAgent: { id: 'agent-601', agencyName: 'Canberra Rentals' },
      loans: [
        { id: 'loan-601', lender: 'Westpac', endDate: null },
        { id: 'loan-602', lender: 'Westpac', endDate: null },
      ],
    },
  },
}
