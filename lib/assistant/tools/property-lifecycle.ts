import { tool } from 'ai'
import { z } from 'zod'
import { findPropertyById, listTenancies, listManagementAgents, findActiveAgent } from '@/lib/property'
import { listInstallmentLoans } from '@/lib/borrowings'
import { logger } from '@/lib/logger'

const inputSchema = z.object({
  propertyId: z.string().describe('The ID of the property to look up lifecycle state for.'),
})

export function buildPropertyLifecycleTool(userId: string) {
  return tool({
    description: 'Get tenancy, management agent, and loan state for a specific property, to help decide which action-checklist steps are needed.',
    inputSchema,
    execute: async ({ propertyId }) => {
      try {
        const property = await findPropertyById(userId, propertyId)
        if (!property) {
          return {
            found: false,
            statusLabel: 'Looking up property status…',
          }
        }

        const [tenancies, managementAgents, activeAgent, loans] = await Promise.all([
          listTenancies(userId, propertyId),
          listManagementAgents(userId, propertyId),
          findActiveAgent(userId, propertyId),
          listInstallmentLoans(userId, propertyId),
        ])

        return {
          found: true,
          tenancies,
          managementAgents,
          activeManagementAgent: activeAgent ?? null,
          loans,
          source: `/properties/${propertyId}`,
          label: property.nickname ?? property.address,
          statusLabel: 'Looking up property status…',
        }
      } catch (err) {
        logger.error('getPropertyLifecycleState tool error', { err })
        return {
          error: 'Unable to retrieve data. Please try again.',
          source: `/properties/${propertyId}`,
          label: 'Property',
          statusLabel: 'Looking up property status…',
        }
      }
    },
  })
}
