import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stageExtractionResult, commitStagedItems } from '@/lib/ingestion/services/ingestion'
import type { ExtractionResult } from '@/lib/ingestion/extraction/schema'

const USER_ID = 'user-123'
const DOC_ID = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const PROP_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const sampleResult: ExtractionResult = {
  propertyAddress: '123 Smith St, Sydney NSW 2000',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  lineItems: [
    {
      lineItemDate: '2026-03-31',
      amountCents: 400000,
      category: 'rent',
      description: 'Rental income March 2026',
      confidence: 'high',
    },
    {
      lineItemDate: '2026-03-15',
      amountCents: 50000,
      category: 'property_management',
      description: 'Management fee',
      confidence: 'high',
    },
  ],
}

const mocks = vi.hoisted(() => ({
  mockInsertStagedItems: vi.fn(),
  mockDeletePropertyStaged: vi.fn(),
  mockUpdateSourceDocumentPeriod: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbTransaction: vi.fn(),
}))

vi.mock('@/lib/ingestion/repositories/staging', () => ({
  insertStagedItems: (...args: unknown[]) => mocks.mockInsertStagedItems(...args),
  deletePropertyStagedBySourceDocument: (...args: unknown[]) => mocks.mockDeletePropertyStaged(...args),
}))

vi.mock('@/lib/ingestion/repositories/documents', () => ({
  updateSourceDocumentPeriod: (...args: unknown[]) => mocks.mockUpdateSourceDocumentPeriod(...args),
}))

// We mock db directly for commit tests
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        // where() is directly awaitable (ownership + approved queries) and also exposes
        // .limit() for the pending-items guard — both resolve via the same mockDbSelect call.
        where: vi.fn().mockImplementation(() => {
          const p = mocks.mockDbSelect()
          return Object.assign(p, { limit: vi.fn().mockReturnValue(p) })
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => mocks.mockDbInsert()),
      }),
    }),
    transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      mocks.mockDbTransaction(fn)
    ),
  },
}))

// ── stageExtractionResult ─────────────────────────────────────────────────────

describe('stageExtractionResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockDeletePropertyStaged.mockResolvedValue(undefined)
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    mocks.mockUpdateSourceDocumentPeriod.mockResolvedValue(undefined)
  })

  it('deletes existing staging rows before inserting', async () => {
    await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(mocks.mockDeletePropertyStaged).toHaveBeenCalledWith(USER_ID, DOC_ID)
    expect(mocks.mockDeletePropertyStaged).toHaveBeenCalledBefore(mocks.mockInsertStagedItems)
  })

  it('inserts one staging row per line item', async () => {
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    const _result = await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(mocks.mockInsertStagedItems).toHaveBeenCalledOnce()
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [unknown[]]
    expect(items).toHaveLength(2)
  })

  it('sets correct userId and sourceDocumentId on each item', async () => {
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [Array<{ userId: string; sourceDocumentId: string }>]
    for (const item of items) {
      expect(item.userId).toBe(USER_ID)
      expect(item.sourceDocumentId).toBe(DOC_ID)
    }
  })

  it('assigns lineItemIndex in order', async () => {
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [Array<{ lineItemIndex: number }>]
    expect(items[0].lineItemIndex).toBe(0)
    expect(items[1].lineItemIndex).toBe(1)
  })

  it('sets status to pending', async () => {
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [Array<{ status: string }>]
    for (const item of items) {
      expect(item.status).toBe('pending')
    }
  })

  it('sets propertyId to null initially', async () => {
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [Array<{ propertyId: null }>]
    for (const item of items) {
      expect(item.propertyId).toBeNull()
    }
  })

  it('returns stagedCount equal to inserted count', async () => {
    mocks.mockInsertStagedItems.mockResolvedValue([{}, {}])
    const { stagedCount } = await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(stagedCount).toBe(2)
  })

  it('propagates loanAccountId as installmentLoanId', async () => {
    const loanAccountId = 'e5f6a7b8-c9d0-4123-e456-555555555555'
    const resultWithLoan: ExtractionResult = {
      ...sampleResult,
      lineItems: [
        {
          lineItemDate: '2026-03-31',
          amountCents: 200000,
          category: 'loan_payment',
          description: 'Loan payment',
          confidence: 'high',
          loanAccountId,
        },
      ],
    }
    mocks.mockInsertStagedItems.mockResolvedValue([{}])
    await stageExtractionResult(USER_ID, DOC_ID, resultWithLoan)
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [Array<{ installmentLoanId: string }>]
    expect(items[0].installmentLoanId).toBe(loanAccountId)
  })

  it('persists the statement period onto the source document (R19)', async () => {
    await stageExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(mocks.mockUpdateSourceDocumentPeriod).toHaveBeenCalledWith(
      USER_ID, DOC_ID, '2026-03-01', '2026-03-31',
    )
  })

  it('does not insert and returns stagedCount 0 for a zero-transaction statement (R22)', async () => {
    const emptyResult: ExtractionResult = { ...sampleResult, lineItems: [] }
    const { stagedCount } = await stageExtractionResult(USER_ID, DOC_ID, emptyResult)
    expect(stagedCount).toBe(0)
    expect(mocks.mockInsertStagedItems).not.toHaveBeenCalled()
    // Period is still persisted even when there are no line items.
    expect(mocks.mockUpdateSourceDocumentPeriod).toHaveBeenCalledOnce()
  })

  it('propagates a catch-all other_income category to the staged item (R6)', async () => {
    const catchAllResult: ExtractionResult = {
      ...sampleResult,
      lineItems: [
        {
          lineItemDate: '2026-03-20',
          amountCents: 12000,
          category: 'other_income',
          description: 'Unrecognised credit',
          confidence: 'low',
        },
      ],
    }
    mocks.mockInsertStagedItems.mockResolvedValue([{}])
    await stageExtractionResult(USER_ID, DOC_ID, catchAllResult)
    const [items] = mocks.mockInsertStagedItems.mock.calls[0] as [Array<{ category: string }>]
    expect(items[0].category).toBe('other_income')
  })
})

// ── commitStagedItems ─────────────────────────────────────────────────────────

describe('commitStagedItems', () => {
  const approvedItem = {
    id: 'f6a7b8c9-d0e1-4234-f567-666666666666',
    userId: USER_ID,
    sourceDocumentId: DOC_ID,
    lineItemIndex: 0,
    lineItemDate: '2026-03-31',
    amountCents: 400000,
    category: 'rent' as const,
    description: 'Rental income',
    confidence: 'high',
    propertyId: PROP_ID,
    installmentLoanId: null,
    status: 'approved',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Three select().from().where() calls in order: (1) ownership, (2) pending-items guard
    // (empty = none awaiting review), (3) approved items.
    let selectCallCount = 0
    mocks.mockDbSelect.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) return Promise.resolve([{ id: DOC_ID }])
      if (selectCallCount === 2) return Promise.resolve([])
      return Promise.resolve([approvedItem])
    })

    // transaction runs the callback
    mocks.mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([approvedItem]),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }
      await fn(txMock)
    })
  })

  it('throws if a sourceDocumentId does not belong to user', async () => {
    mocks.mockDbSelect.mockResolvedValueOnce([]) // ownership check fails — 0 docs found
    await expect(commitStagedItems(USER_ID, [DOC_ID])).rejects.toThrow('not found or not owned')
  })

  it('throws if an approved item has no propertyId', async () => {
    const noPropertyItem = { ...approvedItem, propertyId: null }
    // ownership OK, no pending items, then approved items with no propertyId
    mocks.mockDbSelect
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([noPropertyItem])
    await expect(commitStagedItems(USER_ID, [DOC_ID])).rejects.toThrow('propertyId')
  })

  it('throws if a document still has unreviewed (pending) items', async () => {
    // ownership OK, then the pending-items guard finds an item awaiting review
    mocks.mockDbSelect
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([{ id: 'still-pending' }])
    await expect(commitStagedItems(USER_ID, [DOC_ID])).rejects.toThrow('unreviewed items')
  })

  it('returns committed count from inserted rows', async () => {
    const result = await commitStagedItems(USER_ID, [DOC_ID])
    expect(result.committed).toBe(1)
  })

  it('returns committed: 0 when no approved items', async () => {
    mocks.mockDbSelect
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([]) // no pending items
      .mockResolvedValueOnce([]) // no approved items
    const result = await commitStagedItems(USER_ID, [DOC_ID])
    expect(result.committed).toBe(0)
  })

  function captureTxSetCalls(setCalls: unknown[], insertedRows: unknown[] = [approvedItem]) {
    mocks.mockDbTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((v: unknown) => {
            setCalls.push(v)
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }
          }),
        }),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(insertedRows) }) }),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }
      await fn(txMock)
    })
  }

  it('sets committed document status to confirmed (R8)', async () => {
    const setCalls: unknown[] = []
    captureTxSetCalls(setCalls)
    await commitStagedItems(USER_ID, [DOC_ID])
    expect(setCalls).toContainEqual({ status: 'confirmed' })
    expect(setCalls).not.toContainEqual(expect.objectContaining({ status: 'dismissed' }))
  })

  it('auto-dismisses a document with no committable items instead of leaving it pending (R7)', async () => {
    mocks.mockDbSelect
      .mockResolvedValueOnce([{ id: DOC_ID }]) // ownership OK
      .mockResolvedValueOnce([])              // no pending items
      .mockResolvedValueOnce([])              // no approved items
    const setCalls: unknown[] = []
    captureTxSetCalls(setCalls, [])
    await commitStagedItems(USER_ID, [DOC_ID])
    expect(setCalls).toContainEqual(expect.objectContaining({ status: 'dismissed' }))
    expect(setCalls).not.toContainEqual({ status: 'confirmed' })
  })

  it('deletes staging items within the transaction after committing', async () => {
    const deleteMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) })
    mocks.mockDbTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      const txMock = {
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) }),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([approvedItem]) }) }),
        delete: deleteMock,
      }
      await fn(txMock)
    })
    await commitStagedItems(USER_ID, [DOC_ID])
    expect(deleteMock).toHaveBeenCalledOnce()
  })
})
