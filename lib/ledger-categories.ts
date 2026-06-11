import type { LedgerCategory } from '@/db/schema'

export const CATEGORY_BUCKET = {
  rent:                'rent',
  insurance:           'expense',
  rates:               'expense',
  repairs:             'expense',
  property_management: 'expense',
  utilities:           'expense',
  strata_fees:         'expense',
  other_expense:       'expense',
  loan_payment:        'mortgage',
} satisfies Record<LedgerCategory, 'rent' | 'expense' | 'mortgage'>
