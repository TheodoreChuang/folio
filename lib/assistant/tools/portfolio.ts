import { tool } from 'ai'
import { z } from 'zod'
import { getPortfolioData, computePortfolioLVR } from '@/lib/aggregate'
import { listEntities } from '@/lib/entities'
import { logger } from '@/lib/logger'

const inputSchema = z.object({})

export function buildPortfolioTool(userId: string) {
  return tool({
    description: 'Get a summary of the user\'s property portfolio including total value, debt, LVR, and entities.',
    inputSchema,
    execute: async () => {
      try {
        const [data, entities] = await Promise.all([
          getPortfolioData(userId),
          listEntities(userId),
        ])
        const lvr = computePortfolioLVR(data.properties, data.valuations, data.balances, data.loans)
        // Strip accountReference — sensitive field, not for model output (mirrors getLoanDetail)
        const safeLoans = data.loans.map(({ accountReference: _, ...rest }) => rest)
        return {
          ...data,
          loans: safeLoans,
          entities,
          lvr,
          source: '/dashboard',
          label: 'Portfolio',
          statusLabel: 'Reading your portfolio summary…',
        }
      } catch (err) {
        logger.error('getPortfolioSummary tool error', { err })
        return {
          error: 'Unable to retrieve data. Please try again.',
          source: '/dashboard',
          label: 'Portfolio',
          statusLabel: 'Reading your portfolio summary…',
        }
      }
    },
  })
}
