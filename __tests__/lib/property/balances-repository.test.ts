import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listBalances,
  createBalance,
  deleteBalance,
  listLatestBalancesForUser,
} from '@/lib/property/repositories/balances'

const mocks = vi.hoisted(() => ({
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockReturning: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: mocks.mockOrderBy,
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
  },
}))

const balance = {
  id: 'bal-111',
  userId: 'user-aaa',
  loanAccountId: 'loan-111',
  recordedAt: '2026-01-01',
  balanceCents: 30000000,
  notes: null,
  createdAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

describe('listBalances', () => {
  it('returns balances for loan ordered by date desc', async () => {
    mocks.mockOrderBy.mockResolvedValue([balance])
    const result = await listBalances('user-aaa', 'loan-111')
    expect(result).toHaveLength(1)
    expect(result[0].balanceCents).toBe(30000000)
  })
})

describe('listLatestBalancesForUser', () => {
  it('returns all balance rows for user ordered by loanAccountId and recordedAt desc', async () => {
    mocks.mockOrderBy.mockResolvedValue([balance])
    const result = await listLatestBalancesForUser('user-aaa')
    expect(result).toHaveLength(1)
  })
})

describe('createBalance', () => {
  it('inserts and returns the balance', async () => {
    mocks.mockReturning.mockResolvedValue([balance])
    const result = await createBalance({
      userId: 'user-aaa',
      loanAccountId: 'loan-111',
      recordedAt: '2026-01-01',
      balanceCents: 30000000,
      notes: null,
    })
    expect(result).toEqual(balance)
  })
})

describe('deleteBalance', () => {
  it('deletes and returns the balance', async () => {
    mocks.mockReturning.mockResolvedValue([balance])
    const result = await deleteBalance('user-aaa', 'loan-111', balance.id)
    expect(result).toEqual(balance)
  })

  it('returns undefined when not found', async () => {
    mocks.mockReturning.mockResolvedValue([])
    const result = await deleteBalance('user-aaa', 'loan-111', balance.id)
    expect(result).toBeUndefined()
  })
})
