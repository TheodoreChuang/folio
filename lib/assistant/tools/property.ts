import { tool } from 'ai'
import { z } from 'zod'
import { getPropertyWithStats } from '@/lib/property'

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
            source: 'Property lookup',
            statusLabel: 'Looking up property details…',
          }
        }
        const label = result.property.nickname ?? result.property.address
        return {
          found: true,
          ...result,
          source: `Property: ${label}`,
          statusLabel: 'Looking up property details…',
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Unknown error',
          source: 'Property lookup',
          statusLabel: 'Looking up property details…',
        }
      }
    },
  })
}
