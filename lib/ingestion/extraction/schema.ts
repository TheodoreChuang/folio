import { z } from 'zod'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const classificationResultSchema = z.object({
  documentType: z.enum(['pm_statement', 'loan_statement', 'unknown']),
  // Independent of documentType: whether this is a single-period statement or an
  // annual/summary document aggregating a whole year (R19). Defaults to 'periodic'.
  statementScope: z.enum(['periodic', 'annual_summary']).default('periodic'),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type ClassificationResult = z.infer<typeof classificationResultSchema>
const CATEGORIES = [
  'rent',
  'insurance',
  'rates',
  'repairs',
  'property_management',
  'utilities',
  'strata_fees',
  'other_expense',
  'loan_payment',
  'other_income',
] as const

export const loanPaymentSchema = z.object({
  paymentDate: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  amountCents: z.number().int().positive('Must be a positive integer in cents'),
  interestCents: z.number().int().nonnegative().optional(),
  principalCents: z.number().int().nonnegative().optional(),
  description: z.string().max(500).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
})

export const loanExtractionResultSchema = z.object({
  lenderName: z.string(),
  accountNumber: z.string().optional(),
  statementPeriodStart: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  statementPeriodEnd: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  closingBalanceCents: z.number().int().nonnegative(),
  payments: z.array(loanPaymentSchema).min(0),
})

export type LoanExtractionResult = z.infer<typeof loanExtractionResultSchema>

export const extractedLineItemSchema = z.object({
  lineItemDate: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  amountCents: z.number().int().positive('Must be a positive integer in cents'),
  category: z.enum(CATEGORIES),
  description: z.string().max(500),
  confidence: z.enum(['high', 'medium', 'low']),
  loanAccountId: z.string().uuid().optional(),
})

export const extractionResultSchema = z.object({
  propertyAddress: z.string(),
  statementPeriodStart: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  statementPeriodEnd: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  // .min(0): a valid statement with no transactions in the period must extract as an
  // empty result (R22), not throw a schema error that surfaces as a 500.
  lineItems: z.array(extractedLineItemSchema).min(0),
})

export type ExtractedLineItem = z.infer<typeof extractedLineItemSchema>
export type ExtractionResult = z.infer<typeof extractionResultSchema>
