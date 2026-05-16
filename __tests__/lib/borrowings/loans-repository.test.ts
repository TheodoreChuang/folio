import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listInstallmentLoans,
  findInstallmentLoanById,
  createInstallmentLoan,
  updateInstallmentLoan,
  endInstallmentLoan,
} from '@/lib/borrowings/repositories/loans'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const BAL_ID  = 'c3d4e5f6-a7b8-4901-c234-333333333333'

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

const balanceRow = {
  id: BAL_ID,
  userId: 'user-123',
  installmentLoanId: LOAN_ID,
  recordedAt: '2026-03-01',
  balanceCents: 45000000,
  notes: null,
  createdAt: new Date(),
}

let selectCallCount = 0

const mocks = vi.hoisted(() => ({
  mockLoansSelect: vi.fn(),
  mockBalancesSelect: vi.fn(),
  mockLoanLimit: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockInsertReturning: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      selectCallCount++
      const call = selectCallCount
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: mocks.mockLoanLimit,
            orderBy: vi.fn().mockImplementation(() =>
              call === 1 ? mocks.mockLoansSelect() : mocks.mockBalancesSelect()
            ),
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              (call === 1 ? mocks.mockLoansSelect() : mocks.mockBalancesSelect()).then(resolve, reject),
          }),
        }),
      }
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockUpdateReturning,
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
  },
}))

describe('listInstallmentLoans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockLoansSelect.mockResolvedValue([loanRow])
    mocks.mockBalancesSelect.mockResolvedValue([balanceRow])
  })

  it('returns loans with latestBalance attached', async () => {
    const result = await listInstallmentLoans('user-123', PROP_ID)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(LOAN_ID)
    expect(result[0].latestBalance).toEqual({ balanceCents: 45000000, recordedAt: '2026-03-01' })
  })

  it('returns null latestBalance when no balance exists for the loan', async () => {
    mocks.mockBalancesSelect.mockResolvedValue([])
    const result = await listInstallmentLoans('user-123', PROP_ID)
    expect(result[0].latestBalance).toBeNull()
  })

  it('picks the most recent balance when multiple exist', async () => {
    mocks.mockBalancesSelect.mockResolvedValue([
      { ...balanceRow, balanceCents: 45000000, recordedAt: '2026-03-01' },
      { ...balanceRow, id: 'older', balanceCents: 50000000, recordedAt: '2025-01-01' },
    ])
    const result = await listInstallmentLoans('user-123', PROP_ID)
    // First row in the ordered-by-desc result wins
    expect(result[0].latestBalance!.balanceCents).toBe(45000000)
  })

  it('returns empty array when no loans exist', async () => {
    mocks.mockLoansSelect.mockResolvedValue([])
    const result = await listInstallmentLoans('user-123', PROP_ID)
    expect(result).toHaveLength(0)
  })
})

describe('findInstallmentLoanById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockLoanLimit.mockResolvedValue([loanRow])
  })

  it('returns the loan when found', async () => {
    const result = await findInstallmentLoanById('user-123', LOAN_ID)
    expect(result).toBeDefined()
    expect(result!.id).toBe(LOAN_ID)
  })

  it('returns undefined when not found', async () => {
    mocks.mockLoanLimit.mockResolvedValue([])
    const result = await findInstallmentLoanById('user-123', LOAN_ID)
    expect(result).toBeUndefined()
  })
})

describe('createInstallmentLoan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockInsertReturning.mockResolvedValue([loanRow])
  })

  it('returns the created loan', async () => {
    const result = await createInstallmentLoan('user-123', PROP_ID, {
      lender: 'Westpac',
      nickname: 'Investment loan',
      startDate: '2020-01-01',
      endDate: '2050-01-01',
    })
    expect(result.id).toBe(LOAN_ID)
    expect(result.lender).toBe('Westpac')
  })
})

describe('updateInstallmentLoan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, lender: 'ANZ' }])
  })

  it('returns the updated loan', async () => {
    const result = await updateInstallmentLoan('user-123', PROP_ID, LOAN_ID, { lender: 'ANZ' })
    expect(result).toBeDefined()
    expect(result!.lender).toBe('ANZ')
  })

  it('returns undefined when loan not found', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([])
    const result = await updateInstallmentLoan('user-123', PROP_ID, LOAN_ID, { lender: 'ANZ' })
    expect(result).toBeUndefined()
  })
})

describe('endInstallmentLoan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const today = new Date().toISOString().slice(0, 10)
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, endDate: today }])
  })

  it('returns the loan with endDate set to today', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const result = await endInstallmentLoan('user-123', PROP_ID, LOAN_ID)
    expect(result).toBeDefined()
    expect(result!.endDate).toBe(today)
  })

  it('returns undefined when loan not found', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([])
    const result = await endInstallmentLoan('user-123', PROP_ID, LOAN_ID)
    expect(result).toBeUndefined()
  })
})
