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
}

export const CHECKLIST_CATALOG: Record<ChecklistStepType, CatalogEntry> = {
  CREATE_ENTITY: {
    label: 'Add entity',
    requiredId: null,
    buildHref: () => '/entities',
  },
  CREATE_PROPERTY: {
    label: 'Add property',
    requiredId: null,
    buildHref: () => '/properties/new',
  },
  CREATE_LOAN: {
    label: 'Add loan',
    requiredId: 'propertyId',
    buildHref: (propertyId) => `/loans/new?propertyId=${propertyId}`,
  },
  ASSIGN_PROPERTY_MANAGER: {
    label: 'Assign property manager',
    requiredId: 'propertyId',
    buildHref: (propertyId) => `/properties/${propertyId}?tab=management`,
  },
  CLOSE_LOAN: {
    label: 'Close loan',
    requiredId: 'loanId',
    buildHref: (loanId) => `/loans/${loanId}`,
  },
  MARK_PROPERTY_SOLD: {
    label: 'Mark as sold',
    requiredId: 'propertyId',
    buildHref: (propertyId) => `/properties/${propertyId}`,
  },
  UPLOAD_STATEMENTS: {
    label: 'Upload statements',
    requiredId: null,
    buildHref: () => '/upload',
  },
}
