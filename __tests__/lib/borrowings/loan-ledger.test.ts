import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listLoanLedgerEntries,
  createLoanLedgerEntry,
} from '@/lib/borrowings/repositories/loan-ledger'

const USER_ID = 'user-123'
const LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const ENTRY_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'
const DOC_ID   = 'd4e5f6a7-b8c9-4012-d345-444444444444'

const entryRow = {
  id:                ENTRY_ID,
  userId:            USER_ID,
  installmentLoanId: LOAN_ID,
  paymentDate:       '2026-04-01',
  amountCents:       216700,
  interestCents:     150000,
  principalCents:    66700,
  description:       null,
  sourceDocumentId:  null,
  deletedAt:         null,
  createdAt:         new Date(),
}

const mocks = vi.hoisted(() => ({
  mockListQuery: vi.fn(),
  mockInsertReturning: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: mocks.mockListQuery,
          }),
        }),
      }),
    })),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
  },
}))

// ── listLoanLedgerEntries ─────────────────────────────────────────────────────

describe('listLoanLedgerEntries — soft-delete filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not return soft-deleted entries', async () => {
    mocks.mockListQuery.mockResolvedValue([])
    const result = await listLoanLedgerEntries(USER_ID, LOAN_ID)
    expect(result).toEqual([])
  })

  it('returns entries when deletedAt is null', async () => {
    mocks.mockListQuery.mockResolvedValue([{ ...entryRow, sourceFileName: null }])
    const result = await listLoanLedgerEntries(USER_ID, LOAN_ID)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(ENTRY_ID)
  })
})

describe('listLoanLedgerEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockListQuery.mockResolvedValue([{ ...entryRow, sourceFileName: null }])
  })

  it('returns entries for the given loan', async () => {
    const result = await listLoanLedgerEntries(USER_ID, LOAN_ID)
    expect(result).toHaveLength(1)
    expect(result[0].installmentLoanId).toBe(LOAN_ID)
  })

  it('returns empty array when no entries exist', async () => {
    mocks.mockListQuery.mockResolvedValue([])
    const result = await listLoanLedgerEntries(USER_ID, LOAN_ID)
    expect(result).toHaveLength(0)
  })

  it('includes sourceFileName from joined source_documents when sourceDocumentId is set', async () => {
    mocks.mockListQuery.mockResolvedValue([
      { ...entryRow, sourceDocumentId: DOC_ID, sourceFileName: 'statement-may.pdf' },
    ])
    const result = await listLoanLedgerEntries(USER_ID, LOAN_ID)
    expect(result[0].sourceFileName).toBe('statement-may.pdf')
  })

  it('returns null sourceFileName when sourceDocumentId is null', async () => {
    mocks.mockListQuery.mockResolvedValue([{ ...entryRow, sourceFileName: null }])
    const result = await listLoanLedgerEntries(USER_ID, LOAN_ID)
    expect(result[0].sourceFileName).toBeNull()
  })
})

// ── createLoanLedgerEntry ─────────────────────────────────────────────────────

describe('createLoanLedgerEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockInsertReturning.mockResolvedValue([entryRow])
  })

  it('inserts and returns the new row with correct field values', async () => {
    const result = await createLoanLedgerEntry(USER_ID, LOAN_ID, {
      paymentDate:   '2026-04-01',
      amountCents:   216700,
      interestCents: 150000,
      principalCents: 66700,
    })
    expect(result.id).toBe(ENTRY_ID)
    expect(result.amountCents).toBe(216700)
    expect(result.interestCents).toBe(150000)
    expect(result.principalCents).toBe(66700)
  })

  it('returns row with null optional fields when not provided', async () => {
    const minimalRow = {
      ...entryRow,
      interestCents: null,
      principalCents: null,
      description: null,
      sourceDocumentId: null,
    }
    mocks.mockInsertReturning.mockResolvedValue([minimalRow])
    const result = await createLoanLedgerEntry(USER_ID, LOAN_ID, {
      paymentDate: '2026-04-01',
      amountCents: 216700,
    })
    expect(result.interestCents).toBeNull()
    expect(result.principalCents).toBeNull()
    expect(result.description).toBeNull()
    expect(result.sourceDocumentId).toBeNull()
  })
})
