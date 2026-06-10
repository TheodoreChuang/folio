import { describe, it, expect, vi, beforeEach } from 'vitest'
import { softDeleteDocumentWithEntries } from '@/lib/ingestion/repositories/documents'

const mocks = vi.hoisted(() => ({
  mockUpdateEntries: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.mockTransaction(...args),
  },
}))

function setupTransactionMock() {
  mocks.mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let callCount = 0
    const tx = {
      update: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: mocks.mockUpdateEntries,
              }),
            }),
          }
        }
        return {
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => mocks.mockUpdateDoc()),
          }),
        }
      }),
    }
    return fn(tx)
  })
}

describe('softDeleteDocumentWithEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockUpdateEntries.mockResolvedValue([{ id: 'e1' }])
    mocks.mockUpdateDoc.mockResolvedValue([])
    setupTransactionMock()
  })

  it('soft-deletes propertyLedger entries before sourceDocument', async () => {
    const callOrder: string[] = []
    mocks.mockUpdateEntries.mockImplementation(() => {
      callOrder.push('entries')
      return Promise.resolve([{ id: 'e1' }])
    })
    mocks.mockUpdateDoc.mockImplementation(() => {
      callOrder.push('doc')
      return Promise.resolve([])
    })

    await softDeleteDocumentWithEntries('user-123', 'doc-id')
    expect(callOrder).toEqual(['entries', 'doc'])
  })

  it('returns entriesDeleted count matching number of soft-deleted rows', async () => {
    mocks.mockUpdateEntries.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }])
    const result = await softDeleteDocumentWithEntries('user-123', 'doc-id')
    expect(result.entriesDeleted).toBe(3)
  })

  it('returns entriesDeleted: 0 when no entries are linked to the document', async () => {
    mocks.mockUpdateEntries.mockResolvedValue([])
    const result = await softDeleteDocumentWithEntries('user-123', 'doc-id')
    expect(result.entriesDeleted).toBe(0)
  })

  it('propagates DB error thrown inside transaction', async () => {
    mocks.mockTransaction.mockRejectedValue(new Error('DB error'))
    await expect(softDeleteDocumentWithEntries('user-123', 'doc-id')).rejects.toThrow('DB error')
  })
})
