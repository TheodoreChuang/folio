import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listLoans,
  findLoanById,
  createLoan,
  updateLoan,
  closeLoan,
} from '@/lib/property/repositories/loans'

const mocks = vi.hoisted(() => ({
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockReturning: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mocks.mockWhere,
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockReturning,
        }),
      }),
    }),
  },
}))

const loan = {
  id: 'loan-111',
  userId: 'user-aaa',
  propertyId: 'prop-111',
  lender: 'ANZ',
  nickname: null,
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  entityId: null,
  createdAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

describe('listLoans', () => {
  it('returns loans for property', async () => {
    mocks.mockWhere.mockResolvedValue([loan])
    const result = await listLoans('user-aaa', 'prop-111')
    expect(result).toHaveLength(1)
    expect(result[0].lender).toBe('ANZ')
  })
})

describe('findLoanById', () => {
  it('returns the loan when found', async () => {
    mocks.mockWhere.mockReturnValue({ limit: mocks.mockLimit })
    mocks.mockLimit.mockResolvedValue([loan])
    const result = await findLoanById('user-aaa', 'prop-111', loan.id)
    expect(result).toEqual(loan)
  })

  it('returns undefined when not found', async () => {
    mocks.mockWhere.mockReturnValue({ limit: mocks.mockLimit })
    mocks.mockLimit.mockResolvedValue([])
    const result = await findLoanById('user-aaa', 'prop-111', loan.id)
    expect(result).toBeUndefined()
  })
})

describe('createLoan', () => {
  it('inserts and returns the loan', async () => {
    mocks.mockReturning.mockResolvedValue([loan])
    const result = await createLoan({
      userId: 'user-aaa',
      propertyId: 'prop-111',
      lender: 'ANZ',
      nickname: null,
      startDate: '2020-01-01',
      endDate: '2050-01-01',
    })
    expect(result).toEqual(loan)
  })
})

describe('updateLoan', () => {
  it('updates and returns the loan', async () => {
    mocks.mockReturning.mockResolvedValue([{ ...loan, lender: 'CBA' }])
    const result = await updateLoan('user-aaa', 'prop-111', loan.id, { lender: 'CBA' })
    expect(result?.lender).toBe('CBA')
  })

  it('returns undefined when loan not found', async () => {
    mocks.mockReturning.mockResolvedValue([])
    const result = await updateLoan('user-aaa', 'prop-111', loan.id, { lender: 'CBA' })
    expect(result).toBeUndefined()
  })
})

describe('closeLoan', () => {
  it('sets endDate to today and returns the loan', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mocks.mockReturning.mockResolvedValue([{ ...loan, endDate: today }])
    const result = await closeLoan('user-aaa', 'prop-111', loan.id)
    expect(result?.endDate).toBe(today)
  })

  it('returns undefined when loan not found', async () => {
    mocks.mockReturning.mockResolvedValue([])
    const result = await closeLoan('user-aaa', 'prop-111', loan.id)
    expect(result).toBeUndefined()
  })
})
