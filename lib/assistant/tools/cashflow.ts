import { tool } from 'ai'
import { z } from 'zod'
import { getCashflowSummary } from '@/lib/aggregate'

const inputSchema = z.object({
  from: z.string().describe('Start date in YYYY-MM-DD format.'),
  to: z.string().describe('End date in YYYY-MM-DD format.'),
  propertyId: z.string().optional().describe('Filter to a specific property by ID.'),
  entityId: z.string().optional().describe('Filter to a specific entity by ID.'),
})

export function buildCashflowTool(userId: string) {
  return tool({
    description: 'Get cashflow summary for a date range, including rent, expenses, mortgage payments, and flags for missing statements.',
    inputSchema,
    execute: async ({ from, to, propertyId, entityId }) => {
      try {
        const result = await getCashflowSummary(userId, from, to, { propertyId, entityId })
        return {
          ...result,
          source: `Cashflow ${from} to ${to}`,
          statusLabel: 'Analysing your cashflow…',
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Unknown error',
          source: `Cashflow ${from} to ${to}`,
          statusLabel: 'Analysing your cashflow…',
        }
      }
    },
  })
}
