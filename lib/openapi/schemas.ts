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
