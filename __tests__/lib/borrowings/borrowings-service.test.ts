import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateLoanOwnership } from '@/lib/borrowings/services/borrowings'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const loanRow = {
  id: LOAN_ID,
  userId: 'user-123',
  propertyId: PROP_ID,
  lender: 'Westpac',
  nickname: 'Investment loan',
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  entityId: null,
  createdAt: new Date(),
}

const mocks = vi.hoisted(() => ({
  mockFindInstallmentLoanById: vi.fn(),
}))

vi.mock('@/lib/borrowings/repositories/loans', () => ({
  findInstallmentLoanById: mocks.mockFindInstallmentLoanById,
}))

describe('validateLoanOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockFindInstallmentLoanById.mockResolvedValue(loanRow)
  })

  it('returns the loan when userId and propertyId match', async () => {
    const result = await validateLoanOwnership('user-123', PROP_ID, LOAN_ID)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(LOAN_ID)
  })

  it('returns null when loan is not found (wrong user)', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue(undefined)
    const result = await validateLoanOwnership('user-123', PROP_ID, LOAN_ID)
    expect(result).toBeNull()
  })

  it('returns null when loan belongs to a different property', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue({
      ...loanRow,
      propertyId: 'ffffffff-ffff-4fff-afff-ffffffffffff',
    })
    const result = await validateLoanOwnership('user-123', PROP_ID, LOAN_ID)
    expect(result).toBeNull()
  })

  it('calls findInstallmentLoanById with correct userId and loanId', async () => {
    await validateLoanOwnership('user-123', PROP_ID, LOAN_ID)
    expect(mocks.mockFindInstallmentLoanById).toHaveBeenCalledWith('user-123', LOAN_ID)
  })
})
