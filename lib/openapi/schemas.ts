import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

// ── Portfolio ─────────────────────────────────────────────────────────────────

export const PortfolioSummaryResponseSchema = z.object({
  portfolio: z.object({
    totalValueCents: z.number().int().openapi({ description: 'Sum of latest property valuations in cents' }),
    totalDebtCents: z.number().int().openapi({ description: 'Sum of latest loan balances in cents' }),
    lvr: z.number().nullable().openapi({ description: 'Loan-to-value ratio as a percentage (0–100), null if no valuations' }),
    propertiesValued: z.number().int().openapi({ description: 'Number of properties with a recorded valuation' }),
    propertiesTotal: z.number().int().openapi({ description: 'Total number of active properties' }),
    loansWithBalance: z.number().int().openapi({ description: 'Number of loans with a recorded balance' }),
    activeLoansTotal: z.number().int().openapi({ description: 'Total number of active loans' }),
  }),
})

// ── Ledger ────────────────────────────────────────────────────────────────────

export const LedgerFyResponseSchema = z.object({
  from: z.string().openapi({ description: 'Start of financial year (YYYY-07-01)', example: '2025-07-01' }),
  to: z.string().openapi({ description: 'End of financial year (YYYY-06-30)', example: '2026-06-30' }),
})

// ── API Keys ──────────────────────────────────────────────────────────────────

export const ApiKeyPublicSchema = z.object({
  id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  name: z.string(),
  keyPrefix: z.string().openapi({ description: 'First 14 characters of the key (safe to display)' }),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const ApiKeysListResponseSchema = z.object({
  apiKeys: z.array(ApiKeyPublicSchema),
})

export const ApiKeyCreatedResponseSchema = z.object({
  apiKey: z.object({
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    name: z.string(),
    key: z.string().openapi({ description: 'Full API key — store immediately, not shown again', example: 'sk_live_abc123...' }),
    keyPrefix: z.string(),
    createdAt: z.string(),
  }),
})

export const ApiKeyRevokedResponseSchema = z.object({
  success: z.literal(true),
})

// ── Entities ──────────────────────────────────────────────────────────────────

export const EntitySchema = z.object({
  id: z.string().openapi({ format: 'uuid' }),
  userId: z.string().openapi({ format: 'uuid' }),
  name: z.string(),
  type: z.enum(['individual', 'joint', 'trust', 'company', 'superannuation']),
  createdAt: z.string().openapi({ description: 'ISO 8601 timestamp' }),
})

export const EntitiesListResponseSchema = z.object({
  entities: z.array(EntitySchema),
})

// ── Properties ────────────────────────────────────────────────────────────────

export const PropertySchema = z.object({
  id: z.string().openapi({ format: 'uuid' }),
  userId: z.string().openapi({ format: 'uuid' }),
  address: z.string(),
  nickname: z.string().nullable(),
  startDate: z.string().openapi({ description: 'Acquisition date (YYYY-MM-DD)' }),
  endDate: z.string().nullable().openapi({ description: 'Sale settlement date (YYYY-MM-DD)' }),
  entityId: z.string().nullable().openapi({ format: 'uuid' }),
  createdAt: z.string().openapi({ description: 'ISO 8601 timestamp' }),
  propertyType: z.enum(['house', 'unit', 'townhouse', 'land']).nullable(),
  purchasePriceCents: z.number().int().nullable(),
  saleDate: z.string().nullable().openapi({ description: 'Contract date of sale (YYYY-MM-DD)' }),
  salePriceCents: z.number().int().nullable(),
  saleSettlementDate: z.string().nullable().openapi({ description: 'Settlement date (YYYY-MM-DD)' }),
  lvrPercent: z.number().nullish().openapi({ description: 'Loan-to-value ratio for this property as a percentage, null if no valuation recorded' }),
})

export const PropertiesListResponseSchema = z.object({
  properties: z.array(PropertySchema),
})

export const PropertyCreatedResponseSchema = z.object({
  property: PropertySchema,
})

// ── Loans ─────────────────────────────────────────────────────────────────────

export const InstallmentLoanSchema = z.object({
  id: z.string().openapi({ format: 'uuid' }),
  userId: z.string().openapi({ format: 'uuid' }),
  propertyId: z.string().nullable().openapi({ format: 'uuid' }),
  lender: z.string(),
  nickname: z.string().nullable(),
  accountReference: z.string().nullable(),
  startDate: z.string().nullable().openapi({ description: 'Loan start date (YYYY-MM-DD)' }),
  endDate: z.string().nullable().openapi({ description: 'Loan end date (YYYY-MM-DD)' }),
  entityId: z.string().nullable().openapi({ format: 'uuid' }),
  loanType: z.enum(['interest_only', 'principal_and_interest', 'line_of_credit']).nullable(),
  ioEndDate: z.string().nullable().openapi({ description: 'End of interest-only period (YYYY-MM-DD)' }),
  interestRate: z.string().nullable().openapi({ description: 'Interest rate as a decimal string (e.g. "5.75")' }),
  rateType: z.enum(['variable', 'fixed']).nullable(),
  loanTermYears: z.number().int().nullable(),
  originalAmountCents: z.number().int().nullable(),
  createdAt: z.string().openapi({ description: 'ISO 8601 timestamp' }),
})

export const FlatInstallmentLoanSchema = InstallmentLoanSchema.extend({
  latestBalance: z.object({
    balanceCents: z.number().int(),
    recordedAt: z.string().openapi({ description: 'Date the balance was recorded (YYYY-MM-DD)' }),
  }).nullable(),
  propertyAddress: z.string().nullable(),
  entityName: z.string().nullable(),
})

export const LoansListResponseSchema = z.object({
  loans: z.array(FlatInstallmentLoanSchema),
})

// ── Portfolio return ──────────────────────────────────────────────────────────

export const PortfolioReturnResponseSchema = z.object({
  return: z.object({
    grossYieldPct: z.number().nullable().openapi({ description: 'Gross rental yield as a percentage' }),
    capitalGrowthPct: z.number().nullable().openapi({ description: 'Capital growth as a percentage over the period' }),
    capitalGrowthCents: z.number().int().nullable().openapi({ description: 'Capital growth in cents' }),
    totalReturnPct: z.number().nullable().openapi({ description: 'Total return (income + capital) as a percentage' }),
    annualisedRentCents: z.number().int().openapi({ description: 'Annualised rental income in cents' }),
    currentValueCents: z.number().int().openapi({ description: 'Current total property value in cents' }),
  }),
})

// ── Ledger summary ────────────────────────────────────────────────────────────

const PropertyTotalsSchema = z.object({
  propertyId: z.string().openapi({ format: 'uuid' }),
  address: z.string(),
  nickname: z.string().nullable(),
  rentCents: z.number().int(),
  expensesCents: z.number().int(),
  mortgageCents: z.number().int(),
  netCents: z.number().int(),
  hasStatement: z.boolean(),
  hasMortgage: z.boolean(),
})

export const LedgerSummaryResponseSchema = z.object({
  totals: z.object({
    totalRent: z.number().int(),
    totalExpenses: z.number().int(),
    totalMortgage: z.number().int(),
    netBeforeMortgage: z.number().int(),
    netAfterMortgage: z.number().int(),
    statementsReceived: z.number().int(),
    mortgagesProvided: z.number().int(),
    propertyCount: z.number().int(),
    properties: z.array(PropertyTotalsSchema),
  }),
  flags: z.object({
    missingStatements: z.array(z.string()).openapi({ description: 'Property IDs missing a statement for the period' }),
    missingMortgages: z.array(z.object({
      installmentLoanId: z.string().openapi({ format: 'uuid' }),
      lender: z.string(),
      nickname: z.string().nullable(),
      propertyId: z.string().openapi({ format: 'uuid' }),
      address: z.string(),
    })),
  }),
})

// ── Reports trends ────────────────────────────────────────────────────────────

export const ReportsTrendsResponseSchema = z.object({
  trends: z.array(z.object({
    month: z.string().openapi({ description: 'Month in YYYY-MM format' }),
    rentCents: z.number().int(),
    expensesCents: z.number().int(),
    mortgageCents: z.number().int(),
    netCents: z.number().int(),
    hasData: z.boolean(),
  })),
})
