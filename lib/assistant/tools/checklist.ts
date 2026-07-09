import { tool } from 'ai'
import { z } from 'zod'
import { findPropertyById } from '@/lib/property'
import { findInstallmentLoanById } from '@/lib/borrowings'
import { logger } from '@/lib/logger'
import { CHECKLIST_CATALOG, isChecklistStepType, type ChecklistStepType, type ChecklistStepResult } from '@/lib/assistant/catalog'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STEP_TYPE_DESCRIPTION = (Object.keys(CHECKLIST_CATALOG) as ChecklistStepType[])
  .map((type) => {
    const entry = CHECKLIST_CATALOG[type]
    const idNote = entry.requiredId ? `, requires ${entry.requiredId}` : ''
    return `${type} (${entry.whenToUse}${idNote})`
  })
  .join('; ')

const inputSchema = z.object({
  steps: z.array(z.object({
    type: z.string().describe(`One of these exact catalog step types: ${STEP_TYPE_DESCRIPTION}. Any other value is rejected for that entry.`),
    propertyId: z.string().regex(UUID_REGEX, 'propertyId must be a valid UUID').optional(),
    loanId: z.string().regex(UUID_REGEX, 'loanId must be a valid UUID').optional(),
  })).describe('Ordered list of checklist steps to resolve, in the order they should appear.'),
})

type ResolvedStep = { label: string; href: string }
type StepError = { stepType: string; reason: string }
type ChecklistToolResult =
  | { steps: ChecklistStepResult[]; errors?: StepError[] }
  | { error: string }

export function buildChecklistTool(userId: string) {
  return tool({
    description: 'Resolve a set of requested checklist step types into validated, ordered navigation chips from a fixed catalog. Only ever call this with step types and IDs already confirmed to exist for the user.',
    inputSchema,
    execute: async ({ steps }): Promise<ChecklistToolResult> => {
      const resolved: ResolvedStep[] = []
      const errors: StepError[] = []
      const seen = new Set<string>()

      for (const step of steps) {
        try {
          if (!isChecklistStepType(step.type)) {
            errors.push({ stepType: step.type, reason: 'Unknown step type' })
            continue
          }
          const entry = CHECKLIST_CATALOG[step.type]

          if (entry.requiredId === null) {
            const dedupeKey = `${step.type}:`
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)
            resolved.push({ label: entry.label, href: entry.buildHref() })
            continue
          }

          const id = step[entry.requiredId]
          if (!id) {
            errors.push({ stepType: step.type, reason: `Missing required ${entry.requiredId}` })
            continue
          }

          const dedupeKey = `${step.type}:${id}`
          if (seen.has(dedupeKey)) continue
          seen.add(dedupeKey)

          const owned = entry.requiredId === 'propertyId'
            ? await findPropertyById(userId, id)
            : await findInstallmentLoanById(userId, id)
          if (!owned) {
            errors.push({ stepType: step.type, reason: 'Not found or not owned by user' })
            continue
          }

          // Terminal-state preconditions (already closed/sold) are enforced here structurally,
          // regardless of model routing quality. Existence preconditions (e.g. CREATE_PROPERTY
          // needing an entity, UPLOAD_STATEMENTS needing a property) are prompt-only — the model
          // decides those from getPortfolioSummary/getPropertyLifecycleState output.
          if (step.type === 'CLOSE_LOAN' && 'endDate' in owned && owned.endDate) {
            errors.push({ stepType: step.type, reason: 'Loan already has an end date set' })
            continue
          }
          if (step.type === 'MARK_PROPERTY_SOLD' && 'saleDate' in owned && owned.saleDate) {
            errors.push({ stepType: step.type, reason: 'Property is already marked as sold' })
            continue
          }

          resolved.push({ label: entry.label, href: entry.buildHref(id) })
        } catch (err) {
          logger.error('buildActionChecklist step error', { err, stepType: step.type })
          errors.push({ stepType: step.type, reason: 'Unable to resolve this step' })
        }
      }

      // No top-level `source` field: CitationChips (components/assistant/assistant-message.tsx)
      // renders any completed tool part with a truthy output.source as a citation chip; this
      // tool's output must stay outside that path so it only renders via the checklist branch.
      return {
        steps: resolved.map((step, index) => ({ ...step, order: index + 1 })),
        errors: errors.length > 0 ? errors : undefined,
      }
    },
  })
}
