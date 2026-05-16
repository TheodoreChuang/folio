import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listInstallmentLoanBalances,
  createInstallmentLoanBalance,
  deleteInstallmentLoanBalance,
} from '@/lib/borrowings/repositories/balances'

const LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const BAL_ID  = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const balanceRow = {
  id: BAL_ID,
  userId: 'user-123',
  installmentLoanId: LOAN_ID,
  recordedAt: '2026-03-01',
  balanceCents: 45000000,
  notes: null,
  createdAt: new Date(),
}

const mocks = vi.hoisted(() => ({
  mockSelectOrderBy: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockDeleteReturning: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockImplementation(() => mocks.mockSelectOrderBy()),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockDeleteReturning,
      }),
    }),
  },
}))

describe('listInstallmentLoanBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSelectOrderBy.mockResolvedValue([balanceRow])
  })

  it('returns all balances for the loan', async () => {
    const result = await listInstallmentLoanBalances('user-123', LOAN_ID)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(BAL_ID)
    expect(result[0].balanceCents).toBe(45000000)
  })

  it('returns empty array when no balances exist', async () => {
    mocks.mockSelectOrderBy.mockResolvedValue([])
    const result = await listInstallmentLoanBalances('user-123', LOAN_ID)
    expect(result).toHaveLength(0)
  })
})

describe('createInstallmentLoanBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockInsertReturning.mockResolvedValue([balanceRow])
  })

  it('returns the created balance', async () => {
    const result = await createInstallmentLoanBalance('user-123', LOAN_ID, {
      recordedAt: '2026-03-01',
      balanceCents: 45000000,
    })
    expect(result.id).toBe(BAL_ID)
    expect(result.balanceCents).toBe(45000000)
  })

  it('accepts balanceCents of 0 (fully paid loan)', async () => {
    mocks.mockInsertReturning.mockResolvedValue([{ ...balanceRow, balanceCents: 0 }])
    const result = await createInstallmentLoanBalance('user-123', LOAN_ID, {
      recordedAt: '2026-03-01',
      balanceCents: 0,
    })
    expect(result.balanceCents).toBe(0)
  })

  it('stores notes when provided', async () => {
    mocks.mockInsertReturning.mockResolvedValue([{ ...balanceRow, notes: 'Fixed rate reset' }])
    const result = await createInstallmentLoanBalance('user-123', LOAN_ID, {
      recordedAt: '2026-03-01',
      balanceCents: 45000000,
      notes: 'Fixed rate reset',
    })
    expect(result.notes).toBe('Fixed rate reset')
  })
})

describe('deleteInstallmentLoanBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockDeleteReturning.mockResolvedValue([balanceRow])
  })

  it('returns the deleted balance row', async () => {
    const result = await deleteInstallmentLoanBalance('user-123', LOAN_ID, BAL_ID)
    expect(result).toBeDefined()
    expect(result!.id).toBe(BAL_ID)
  })

  it('returns undefined when balance not found', async () => {
    mocks.mockDeleteReturning.mockResolvedValue([])
    const result = await deleteInstallmentLoanBalance('user-123', LOAN_ID, BAL_ID)
    expect(result).toBeUndefined()
  })
})
