export type ChecklistStepType =
  | 'CREATE_ENTITY'
  | 'CREATE_PROPERTY'
  | 'CREATE_LOAN'
  | 'ASSIGN_PROPERTY_MANAGER'
  | 'CLOSE_LOAN'
  | 'MARK_PROPERTY_SOLD'
  | 'UPLOAD_STATEMENTS'

type CatalogEntry = {
  label: string
  requiredId: 'propertyId' | 'loanId' | null
  buildHref: (id?: string) => string
  // Model-facing: when this step type applies. Surfaced in the checklist tool's
  // input schema description since the model has no other way to learn the valid
  // step type strings or their semantics (the type field itself is a loose string,
  // not a literal enum, so unknown types can be rejected per-entry instead of
  // failing the whole tool call — see checklist.ts).
  whenToUse: string
}

// The buildActionChecklist wire shape — shared by the producer (checklist.ts) and every
// consumer (assistant-message.tsx's chip renderer, the eval harness's grader) so the
// contract can't silently drift between them.
export type ChecklistStepResult = {
  order: number
  label: string
  href: string
}

export function isChecklistStepResult(value: unknown): value is ChecklistStepResult {
  if (typeof value !== 'object' || value === null) return false
  const step = value as Record<string, unknown>
  return typeof step.order === 'number' && typeof step.label === 'string' && typeof step.href === 'string'
}

const CHECKLIST_STEP_TYPES = new Set<string>([
  'CREATE_ENTITY', 'CREATE_PROPERTY', 'CREATE_LOAN', 'ASSIGN_PROPERTY_MANAGER',
  'CLOSE_LOAN', 'MARK_PROPERTY_SOLD', 'UPLOAD_STATEMENTS',
])

export function isChecklistStepType(value: string): value is ChecklistStepType {
  return CHECKLIST_STEP_TYPES.has(value)
}

export const CHECKLIST_CATALOG: Record<ChecklistStepType, CatalogEntry> = {
  CREATE_ENTITY: {
    label: 'Add entity',
    requiredId: null,
    buildHref: () => '/entities',
    whenToUse: 'the user has no entity matching what they need (check entities in getPortfolioSummary)',
  },
  CREATE_PROPERTY: {
    label: 'Add property',
    requiredId: null,
    buildHref: () => '/properties/new',
    whenToUse: 'the user needs to add a new property; requires at least one entity to already exist',
  },
  CREATE_LOAN: {
    label: 'Add loan',
    requiredId: 'propertyId',
    buildHref: (propertyId) => `/loans/new?propertyId=${propertyId}`,
    whenToUse: 'a property needs a new loan added — including an additional loan on a property that already has one, as long as no existing loan already matches the one the user described',
  },
  ASSIGN_PROPERTY_MANAGER: {
    label: 'Assign property manager',
    requiredId: 'propertyId',
    buildHref: (propertyId) => `/properties/${propertyId}?tab=management`,
    whenToUse: 'a property needs a property manager assigned or changed — either it has no active management agent (activeManagementAgent is null in getPropertyLifecycleState), or the user wants to replace an already-active one with a different one',
  },
  CLOSE_LOAN: {
    label: 'Set loan end date',
    requiredId: 'loanId',
    buildHref: (loanId) => `/loans/${loanId}`,
    whenToUse: 'a loan has no endDate set yet and needs to be closed out (e.g. as part of a refinance or sale)',
  },
  MARK_PROPERTY_SOLD: {
    label: 'Mark as sold',
    requiredId: 'propertyId',
    buildHref: (propertyId) => `/properties/${propertyId}`,
    whenToUse: 'the user is selling or has sold a property that is not already marked sold (no saleDate set)',
  },
  UPLOAD_STATEMENTS: {
    label: 'Upload statements',
    requiredId: null,
    buildHref: () => '/upload',
    whenToUse: 'first-run setup only, once at least one property exists',
  },
}
