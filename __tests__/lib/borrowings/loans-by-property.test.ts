import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findLoanIdsByProperty, findLatestBalancesByLoanIds } from '@/lib/borrowings/repositories/loans'

const PROP_ID  = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const LOAN_ID_1 = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const LOAN_ID_2 = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const mocks = vi.hoisted(() => ({
  mockWhere:   vi.fn(),
  mockOrderBy: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mocks.mockWhere,
      }),
    }),
  },
}))

describe('findLoanIdsByProperty', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns loan IDs for the given property and user', async () => {
    mocks.mockWhere.mockResolvedValue([{ id: LOAN_ID_1 }, { id: LOAN_ID_2 }])
    const result = await findLoanIdsByProperty('user-123', PROP_ID)
    expect(result).toEqual([LOAN_ID_1, LOAN_ID_2])
  })

  it('returns empty array when no loans match', async () => {
    mocks.mockWhere.mockResolvedValue([])
    const result = await findLoanIdsByProperty('user-123', PROP_ID)
    expect(result).toEqual([])
  })
})

describe('findLatestBalancesByLoanIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockWhere.mockReturnValue({ orderBy: mocks.mockOrderBy })
  })

  it('returns empty array without querying DB when loanIds is empty', async () => {
    const result = await findLatestBalancesByLoanIds('user-123', [])
    expect(result).toEqual([])
  })

  it('returns one balance entry per loan (latest only)', async () => {
    mocks.mockOrderBy.mockResolvedValue([
      { installmentLoanId: LOAN_ID_1, balanceCents: 50000000, recordedAt: new Date('2026-03-01') },
      { installmentLoanId: LOAN_ID_1, balanceCents: 51000000, recordedAt: new Date('2026-02-01') },
      { installmentLoanId: LOAN_ID_2, balanceCents: 30000000, recordedAt: new Date('2026-03-01') },
    ])
    const result = await findLatestBalancesByLoanIds('user-123', [LOAN_ID_1, LOAN_ID_2])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ installmentLoanId: LOAN_ID_1, balanceCents: 50000000 })
    expect(result[1]).toMatchObject({ installmentLoanId: LOAN_ID_2, balanceCents: 30000000 })
  })

  it('returns empty array when no balances exist', async () => {
    mocks.mockOrderBy.mockResolvedValue([])
    const result = await findLatestBalancesByLoanIds('user-123', [LOAN_ID_1])
    expect(result).toEqual([])
  })
})
