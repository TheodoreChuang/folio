import { tool } from 'ai'
import { z } from 'zod'
import { getCashflowSummary } from '@/lib/aggregate'
import { logger } from '@/lib/logger'

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
          source: '/dashboard',
          label: 'Cashflow',
          statusLabel: 'Analysing your cashflow…',
        }
      } catch (err) {
        logger.error('getCashflowSummary tool error', { err })
        return {
          error: 'Unable to retrieve data. Please try again.',
          source: '/dashboard',
          label: 'Cashflow',
          statusLabel: 'Analysing your cashflow…',
        }
      }
    },
  })
}
