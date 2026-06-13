import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from '@/app/api/v1/documents/[id]/route'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-a012-345678901234'

const docRow = {
  id: VALID_UUID,
  userId: 'user-123',
  fileName: 'statement.pdf',
  filePath: 'documents/user-123/pm_statements/statement.pdf',
  fileHash: 'abc123',
  documentType: 'pm_statement',
  uploadedAt: new Date('2026-01-15T10:00:00Z'),
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindSourceDocumentById: vi.fn(),
  mockSoftDeleteDocumentWithEntries: vi.fn(),
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
}))

function makeDeleteRequest(id = VALID_UUID) {
  return new Request(`http://localhost/api/documents/${id}`, { method: 'DELETE' })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('DELETE /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindSourceDocumentById.mockResolvedValue(docRow)
    mocks.mockSoftDeleteDocumentWithEntries.mockResolvedValue({ entriesDeleted: 2 })
    mocks.mockStorageRemove.mockResolvedValue({ error: null })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID id', async () => {
    const res = await DELETE(makeDeleteRequest('not-a-uuid'), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid/i)
  })

  it('returns 404 when document not found', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when document belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('calls findSourceDocumentById with userId from session', async () => {
    await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(mocks.mockFindSourceDocumentById).toHaveBeenCalledWith('user-123', VALID_UUID)
  })

  it('calls softDeleteDocumentWithEntries with userId and id', async () => {
    await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(mocks.mockSoftDeleteDocumentWithEntries).toHaveBeenCalledWith('user-123', VALID_UUID)
  })

  it('returns 200 with deleted:true and entriesDeleted count', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
    expect(typeof json.entriesDeleted).toBe('number')
  })

  it('calls storage remove with the correct filePath after DB commits', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    expect(mocks.mockStorageRemove).toHaveBeenCalledWith([docRow.filePath])
  })

  it('storage delete failure does not fail the request (still 200)', async () => {
    mocks.mockStorageRemove.mockResolvedValue({ error: { message: 'Not found' } })
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
  })

  it('DB transaction failure returns 500', async () => {
    mocks.mockSoftDeleteDocumentWithEntries.mockRejectedValue(new Error('DB error'))
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Delete failed')
  })

  it('entriesDeleted count matches the number of rows soft-deleted', async () => {
    mocks.mockSoftDeleteDocumentWithEntries.mockResolvedValue({ entriesDeleted: 3 })
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entriesDeleted).toBe(3)
  })
})
