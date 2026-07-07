import { tool } from 'ai'
import { z } from 'zod'
import { findPropertyById } from '@/lib/property'
import { findInstallmentLoanById } from '@/lib/borrowings'
import { logger } from '@/lib/logger'
import { CHECKLIST_CATALOG, type ChecklistStepType } from '@/lib/assistant/catalog'

const inputSchema = z.object({
  steps: z.array(z.object({
    type: z.string().describe('One of the catalog step types.'),
    propertyId: z.string().optional(),
    loanId: z.string().optional(),
  })).describe('Ordered list of checklist steps to resolve, in the order they should appear.'),
})

type ResolvedStep = { label: string; href: string }
type StepError = { stepType: string; reason: string }

export function buildChecklistTool(userId: string) {
  return tool({
    description: 'Resolve a set of requested checklist step types into validated, ordered navigation chips from a fixed catalog. Only ever call this with step types and IDs already confirmed to exist for the user.',
    inputSchema,
    execute: async ({ steps }) => {
      try {
        const resolved: ResolvedStep[] = []
        const errors: StepError[] = []

        for (const step of steps) {
          const entry = CHECKLIST_CATALOG[step.type as ChecklistStepType]
          if (!entry) {
            errors.push({ stepType: step.type, reason: 'Unknown step type' })
            continue
          }

          if (entry.requiredId === null) {
            resolved.push({ label: entry.label, href: entry.buildHref() })
            continue
          }

          const id = step[entry.requiredId]
          if (!id) {
            errors.push({ stepType: step.type, reason: `Missing required ${entry.requiredId}` })
            continue
          }

          const owned = entry.requiredId === 'propertyId'
            ? await findPropertyById(userId, id)
            : await findInstallmentLoanById(userId, id)
          if (!owned) {
            errors.push({ stepType: step.type, reason: 'Not found or not owned by user' })
            continue
          }

          resolved.push({ label: entry.label, href: entry.buildHref(id) })
        }

        // No top-level `source` field: CitationChips (components/assistant/assistant-message.tsx)
        // renders any completed tool part with a truthy output.source as a citation chip; this
        // tool's output must stay outside that path so it only renders via the checklist branch.
        return {
          steps: resolved.map((step, index) => ({ ...step, order: index + 1 })),
          errors: errors.length > 0 ? errors : undefined,
        }
      } catch (err) {
        logger.error('buildActionChecklist tool error', { err })
        return {
          error: 'Unable to build checklist. Please try again.',
        }
      }
    },
  })
}
