import { tool } from 'ai'
import { z } from 'zod'
import { findPropertyById, findActiveAgent } from '@/lib/property'
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

        const [activeAgent, loans] = await Promise.all([
          findActiveAgent(userId, propertyId),
          listInstallmentLoans(userId, propertyId),
        ])
        // Strip accountReference — sensitive field, not for model output (mirrors getPortfolioSummary)
        const safeLoans = loans.map(({ accountReference: _, ...rest }) => rest)
        // No catalog step precondition needs anything beyond "does an active agent exist"
        // (see ASSIGN_PROPERTY_MANAGER's whenToUse in catalog.ts) — tenant names and PM
        // contact details (contactName/phone/email) never need to reach the model.
        const safeActiveAgent = activeAgent
          ? { id: activeAgent.id, agencyName: activeAgent.agencyName }
          : null

        return {
          found: true,
          activeManagementAgent: safeActiveAgent,
          loans: safeLoans,
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
