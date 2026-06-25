import { tool } from 'ai'
import { z } from 'zod'
import { getPropertyWithStats } from '@/lib/property'
import { logger } from '@/lib/logger'

const inputSchema = z.object({
  propertyId: z.string().describe('The ID of the property to look up.'),
})

export function buildPropertyTool(userId: string) {
  return tool({
    description: 'Get detailed information about a specific property including valuation, yield, equity, and LVR.',
    inputSchema,
    execute: async ({ propertyId }) => {
      try {
        const result = await getPropertyWithStats(userId, propertyId)
        if (!result) {
          return {
            found: false,
            statusLabel: 'Looking up property details…',
          }
        }
        return {
          found: true,
          ...result,
          source: `/properties/${propertyId}`,
          statusLabel: 'Looking up property details…',
        }
      } catch (err) {
        logger.error('getPropertyDetail tool error', { err })
        return {
          error: 'Unable to retrieve data. Please try again.',
          source: '/properties',
          statusLabel: 'Looking up property details…',
        }
      }
    },
  })
}
