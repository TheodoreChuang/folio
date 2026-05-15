import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findTrailing12mEntries, createLedgerEntry } from '@/lib/property/repositories/ledger'

const mocks = vi.hoisted(() => ({
  mockWhere: vi.fn(),
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
  },
}))

const entry = {
  id: 'entry-111',
  userId: 'user-aaa',
  propertyId: 'prop-111',
  sourceDocumentId: null,
  loanAccountId: null,
  lineItemDate: '2025-01-15',
  amountCents: 200000,
  category: 'rent' as const,
  description: null,
  userNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

beforeEach(() => vi.clearAllMocks())

describe('findTrailing12mEntries', () => {
  it('returns ledger entries for user and property', async () => {
    mocks.mockWhere.mockResolvedValue([entry])
    const result = await findTrailing12mEntries('user-aaa', 'prop-111')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('rent')
  })

  it('returns empty array when no entries', async () => {
    mocks.mockWhere.mockResolvedValue([])
    const result = await findTrailing12mEntries('user-aaa', 'prop-111')
    expect(result).toEqual([])
  })
})

describe('createLedgerEntry', () => {
  it('inserts and returns the entry', async () => {
    mocks.mockReturning.mockResolvedValue([entry])
    const result = await createLedgerEntry({
      userId: 'user-aaa',
      propertyId: 'prop-111',
      lineItemDate: '2025-01-15',
      amountCents: 200000,
      category: 'rent',
      description: null,
    })
    expect(result).toEqual(entry)
  })
})
