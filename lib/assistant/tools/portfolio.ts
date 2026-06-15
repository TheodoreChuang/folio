import { tool } from 'ai'
import { z } from 'zod'
import { getPortfolioData, computePortfolioLVR } from '@/lib/aggregate'

const inputSchema = z.object({})

export function buildPortfolioTool(userId: string) {
  return tool({
    description: 'Get a summary of the user\'s property portfolio including total value, debt, and LVR.',
    inputSchema,
    execute: async () => {
      try {
        const data = await getPortfolioData(userId)
        const lvr = computePortfolioLVR(data.properties, data.valuations, data.balances, data.loans)
        return {
          ...data,
          lvr,
          source: 'Portfolio summary',
          statusLabel: 'Reading your portfolio summary…',
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Unknown error',
          source: 'Portfolio summary',
          statusLabel: 'Reading your portfolio summary…',
        }
      }
    },
  })
}
