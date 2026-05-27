import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stageLoanExtractionResult, commitLoanStagedItems } from '@/lib/ingestion/services/loan-ingestion'
import type { LoanExtractionResult } from '@/lib/ingestion/extraction/schema'

const USER_ID = 'user-123'
const DOC_ID = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const LOAN_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const sampleResult: LoanExtractionResult = {
  lenderName: 'ANZ',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  closingBalanceCents: 45000000,
  payments: [
    {
      paymentDate: '2026-03-15',
      amountCents: 250000,
      interestCents: 150000,
      principalCents: 100000,
      confidence: 'high',
    },
    {
      paymentDate: '2026-03-28',
      amountCents: 250000,
      confidence: 'medium',
    },
  ],
}

const mocks = vi.hoisted(() => ({
  mockDbSelectWhere: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbTransaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => mocks.mockDbSelectWhere()),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => mocks.mockDbInsert()),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => mocks.mockDbDelete()),
      }),
    }),
    transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      mocks.mockDbTransaction(fn)
    ),
  },
  DrizzleTx: {},
}))

function makeStageTx(capturedSetArgs?: Array<Record<string, unknown>>, capturedInsertValues?: Array<Record<string, unknown>>) {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        capturedSetArgs?.push(args)
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
        capturedInsertValues?.push(...rows)
        return {
          returning: vi.fn().mockResolvedValue(rows.map(() => ({}))),
        }
      }),
    }),
  }
}

function makeCommitTx() {
  return {
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
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => mocks.mockDbDelete()),
      }),
    }),
  }
}

// ── stageLoanExtractionResult ──────────────────────────────────────────────────

describe('stageLoanExtractionResult', () => {
  let capturedSetArgs: Array<Record<string, unknown>> = []
  let capturedInsertValues: Array<Record<string, unknown>> = []

  beforeEach(() => {
    vi.clearAllMocks()
    capturedSetArgs = []
    capturedInsertValues = []
    mocks.mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(makeStageTx(capturedSetArgs, capturedInsertValues))
    })
  })

  it('stages all payments; returned count equals payments.length', async () => {
    const result = await stageLoanExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(result.stagedCount).toBe(sampleResult.payments.length)
  })

  it('wraps all operations in a single transaction', async () => {
    await stageLoanExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(mocks.mockDbTransaction).toHaveBeenCalledOnce()
  })

  it('updates source document period dates inside the transaction', async () => {
    await stageLoanExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(capturedSetArgs).toContainEqual({
      periodStart: sampleResult.statementPeriodStart,
      periodEnd: sampleResult.statementPeriodEnd,
    })
  })

  it('staged rows have installmentLoanId null and status pending', async () => {
    await stageLoanExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(capturedInsertValues).toHaveLength(sampleResult.payments.length)
    for (const row of capturedInsertValues) {
      expect(row).toMatchObject({ installmentLoanId: null, status: 'pending' })
    }
  })

  it('skips delete and insert for empty payments but still updates period dates', async () => {
    let txDeleteCalled = false
    let txInsertCalled = false
    mocks.mockDbTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((args: Record<string, unknown>) => {
            capturedSetArgs.push(args)
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }
          }),
        }),
        delete: vi.fn().mockImplementation(() => {
          txDeleteCalled = true
          return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }
        }),
        insert: vi.fn().mockImplementation(() => {
          txInsertCalled = true
          return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }
        }),
      }
      return fn(tx)
    })

    const result = await stageLoanExtractionResult(USER_ID, DOC_ID, { ...sampleResult, payments: [] })
    expect(result.stagedCount).toBe(0)
    expect(capturedSetArgs).toContainEqual({
      periodStart: sampleResult.statementPeriodStart,
      periodEnd: sampleResult.statementPeriodEnd,
    })
    expect(txDeleteCalled).toBe(false)
    expect(txInsertCalled).toBe(false)
  })

  it('deletes existing staging items before insert for idempotent re-staging', async () => {
    let txDeleteCalled = false
    let deleteCalledBeforeInsert = false
    let txInsertCalled = false
    mocks.mockDbTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          }),
        }),
        delete: vi.fn().mockImplementation(() => {
          txDeleteCalled = true
          if (!txInsertCalled) deleteCalledBeforeInsert = true
          return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }
        }),
        insert: vi.fn().mockImplementation(() => {
          txInsertCalled = true
          return {
            values: vi.fn().mockImplementation((rows: unknown[]) => ({
              returning: vi.fn().mockResolvedValue(rows.map(() => ({}))),
            })),
          }
        }),
      }
      return fn(tx)
    })

    await stageLoanExtractionResult(USER_ID, DOC_ID, sampleResult)
    expect(txDeleteCalled).toBe(true)
    expect(deleteCalledBeforeInsert).toBe(true)
  })
})

// ── commitLoanStagedItems ──────────────────────────────────────────────────────

const approvedItem = {
  id: 'item-1',
  userId: USER_ID,
  sourceDocumentId: DOC_ID,
  lineItemIndex: 0,
  paymentDate: '2026-03-15',
  amountCents: 250000,
  interestCents: 150000,
  principalCents: 100000,
  description: null,
  confidence: 'high',
  installmentLoanId: LOAN_ID,
  status: 'approved',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('commitLoanStagedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockDbSelectWhere
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([approvedItem])
      .mockResolvedValueOnce([{ id: LOAN_ID }])
    mocks.mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(makeCommitTx())
    })
    mocks.mockDbInsert.mockResolvedValue([{ id: 'ledger-1' }])
    mocks.mockDbDelete.mockResolvedValue([])
  })

  it('returns { committed: 0 } immediately when sourceDocumentIds is empty', async () => {
    const result = await commitLoanStagedItems(USER_ID, [])
    expect(result.committed).toBe(0)
    expect(mocks.mockDbTransaction).not.toHaveBeenCalled()
  })

  it('commits all approved items to loan_ledger; returns correct count', async () => {
    const result = await commitLoanStagedItems(USER_ID, [DOC_ID])
    expect(result.committed).toBe(1)
  })

  it('returned count equals number of approved items', async () => {
    const secondApproved = { ...approvedItem, id: 'item-3', lineItemIndex: 1 }
    mocks.mockDbSelectWhere
      .mockReset()
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([approvedItem, secondApproved])
      .mockResolvedValueOnce([{ id: LOAN_ID }])
    mocks.mockDbInsert.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }])
    const result = await commitLoanStagedItems(USER_ID, [DOC_ID])
    expect(result.committed).toBe(2)
  })

  it('deletes staging items inside the transaction', async () => {
    await commitLoanStagedItems(USER_ID, [DOC_ID])
    expect(mocks.mockDbDelete).toHaveBeenCalledOnce()
  })

  it('throws ownership error when source document belongs to another user', async () => {
    mocks.mockDbSelectWhere.mockReset().mockResolvedValueOnce([])
    await expect(
      commitLoanStagedItems(USER_ID, [DOC_ID])
    ).rejects.toThrow('not found or not owned by user')
  })

  it('throws ownership error when source document is soft-deleted', async () => {
    mocks.mockDbSelectWhere.mockReset().mockResolvedValueOnce([])
    await expect(
      commitLoanStagedItems(USER_ID, [DOC_ID])
    ).rejects.toThrow('not found or not owned by user')
  })

  it('fails with clear error if any approved item has null installmentLoanId', async () => {
    mocks.mockDbSelectWhere
      .mockReset()
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([{ ...approvedItem, installmentLoanId: null }])
    await expect(
      commitLoanStagedItems(USER_ID, [DOC_ID])
    ).rejects.toThrow('installmentLoanId')
    expect(mocks.mockDbTransaction).not.toHaveBeenCalled()
  })

  it('throws when installmentLoanId does not belong to the user', async () => {
    mocks.mockDbSelectWhere
      .mockReset()
      .mockResolvedValueOnce([{ id: DOC_ID }])
      .mockResolvedValueOnce([approvedItem])
      .mockResolvedValueOnce([])
    await expect(
      commitLoanStagedItems(USER_ID, [DOC_ID])
    ).rejects.toThrow('not found or not owned by user')
    expect(mocks.mockDbTransaction).not.toHaveBeenCalled()
  })

  it('transaction rollback: if loan_ledger insert fails, staging items not deleted', async () => {
    mocks.mockDbTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('DB insert failed')),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => mocks.mockDbDelete()),
          }),
        }),
      }
      return fn(tx)
    })
    await expect(commitLoanStagedItems(USER_ID, [DOC_ID])).rejects.toThrow('DB insert failed')
    expect(mocks.mockDbDelete).not.toHaveBeenCalled()
  })
})
