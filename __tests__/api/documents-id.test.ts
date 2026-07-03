import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, DELETE } from '@/app/api/v1/documents/[id]/route'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-a012-345678901234'

const confirmedDoc = {
  id: VALID_UUID,
  userId: 'user-123',
  fileName: 'statement.pdf',
  filePath: 'documents/user-123/pm_statements/statement.pdf',
  fileHash: 'abc123',
  documentType: 'pm_statement',
  status: 'confirmed',
  uploadedAt: new Date('2026-01-15T10:00:00Z'),
}

const pendingDoc = { ...confirmedDoc, status: 'pending' }

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindSourceDocumentById: vi.fn(),
  mockSoftDeleteDocumentWithEntries: vi.fn(),
  mockDismissPendingDocument: vi.fn(),
  mockCountActiveLinkedTransactions: vi.fn(),
  mockStorageRemove: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
      storage: {
        from: () => ({ remove: mocks.mockStorageRemove }),
      },
    })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  findSourceDocumentById: (...args: unknown[]) => mocks.mockFindSourceDocumentById(...args),
  softDeleteDocumentWithEntries: (...args: unknown[]) => mocks.mockSoftDeleteDocumentWithEntries(...args),
  dismissPendingDocument: (...args: unknown[]) => mocks.mockDismissPendingDocument(...args),
  countActiveLinkedTransactions: (...args: unknown[]) => mocks.mockCountActiveLinkedTransactions(...args),
}))

function makeRequest(method: 'GET' | 'DELETE', id = VALID_UUID) {
  return new Request(`http://localhost/api/documents/${id}`, { method })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
  mocks.mockFindSourceDocumentById.mockResolvedValue(confirmedDoc)
  mocks.mockSoftDeleteDocumentWithEntries.mockResolvedValue({ entriesDeleted: 2 })
  mocks.mockDismissPendingDocument.mockResolvedValue(undefined)
  mocks.mockCountActiveLinkedTransactions.mockResolvedValue(2)
  mocks.mockStorageRemove.mockResolvedValue({ error: null })
})

describe('GET /api/documents/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('GET'), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid UUID', async () => {
    const res = await GET(makeRequest('GET', 'nope'), makeParams('nope'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the document is not found or not owned', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await GET(makeRequest('GET'), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns the document plus its active transaction count', async () => {
    mocks.mockCountActiveLinkedTransactions.mockResolvedValue(5)
    const res = await GET(makeRequest('GET'), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.document.id).toBe(VALID_UUID)
    expect(json.activeTransactionCount).toBe(5)
    expect(mocks.mockCountActiveLinkedTransactions).toHaveBeenCalledWith('user-123', VALID_UUID)
  })
})

describe('DELETE /api/documents/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID id', async () => {
    const res = await DELETE(makeRequest('DELETE', 'not-a-uuid'), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid/i)
  })

  it('returns 404 when document not found', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when document belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('voids a confirmed upload: soft-deletes its ledger, outcome=voided', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(confirmedDoc)
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.outcome).toBe('voided')
    expect(json.entriesDeleted).toBe(2)
    expect(mocks.mockSoftDeleteDocumentWithEntries).toHaveBeenCalledWith('user-123', VALID_UUID)
    expect(mocks.mockDismissPendingDocument).not.toHaveBeenCalled()
  })

  it('dismisses a pending upload: clears staging, ledger untouched, outcome=dismissed', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(pendingDoc)
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.outcome).toBe('dismissed')
    expect(json.entriesDeleted).toBe(0)
    expect(mocks.mockDismissPendingDocument).toHaveBeenCalledWith('user-123', VALID_UUID)
    expect(mocks.mockSoftDeleteDocumentWithEntries).not.toHaveBeenCalled()
  })

  it('calls storage remove with the correct filePath after DB commits', async () => {
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    expect(mocks.mockStorageRemove).toHaveBeenCalledWith([confirmedDoc.filePath])
  })

  it('storage delete failure does not fail the request (still 200)', async () => {
    mocks.mockStorageRemove.mockResolvedValue({ error: { message: 'Not found' } })
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
  })

  it('DB transaction failure returns 500', async () => {
    mocks.mockSoftDeleteDocumentWithEntries.mockRejectedValue(new Error('DB error'))
    const res = await DELETE(makeRequest('DELETE'), makeParams(VALID_UUID))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Delete failed')
  })
})
