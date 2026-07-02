import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/v1/upload/route'

const mocks = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockGetUser: vi.fn(),
  mockFindSourceDocumentByHash: vi.fn(),
  mockInsertSourceDocument: vi.fn(),
  mockFindOwnedSourceDocumentAnyStatus: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
      storage: {
        from: () => ({
          upload: mocks.mockUpload,
          remove: mocks.mockRemove,
        }),
      },
    })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  findSourceDocumentByHash: (...args: unknown[]) => mocks.mockFindSourceDocumentByHash(...args),
  insertSourceDocument: (...args: unknown[]) => mocks.mockInsertSourceDocument(...args),
  findOwnedSourceDocumentAnyStatus: (...args: unknown[]) => mocks.mockFindOwnedSourceDocumentAnyStatus(...args),
}))

function formDataWithFile(opts: {
  fileContent?: Blob
  fileName?: string
  mimeType?: string
  size?: number
  documentType?: string | null
  replacesSourceDocumentId?: string
}) {
  const {
    fileContent = new Blob(['fake pdf content']),
    fileName = 'test.pdf',
    mimeType = 'application/pdf',
    size = fileContent.size,
    documentType = 'pm_statement',
    replacesSourceDocumentId,
  } = opts
  const file = new File([fileContent], fileName, { type: mimeType })
  if (size !== undefined && file.size !== size) {
    Object.defineProperty(file, 'size', { value: size })
  }
  const form = new FormData()
  form.append('file', file)
  if (documentType !== null) {
    form.append('documentType', documentType)
  }
  if (replacesSourceDocumentId !== undefined) {
    form.append('replacesSourceDocumentId', replacesSourceDocumentId)
  }
  return form
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mocks.mockFindSourceDocumentByHash.mockResolvedValue(null)
    mocks.mockInsertSourceDocument.mockResolvedValue({
      id: 'doc-uuid',
      filePath: 'documents/user-123/pm_statements/test.pdf',
    })
    mocks.mockUpload.mockResolvedValue({ error: null })
    mocks.mockRemove.mockResolvedValue({ error: null })
    mocks.mockFindOwnedSourceDocumentAnyStatus.mockResolvedValue(null)
  })

  it('rejects unauthenticated requests (401)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(401)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('rejects non-PDF files (400)', async () => {
    const form = formDataWithFile({ mimeType: 'text/plain' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('rejects files over 1MB (413)', async () => {
    const oneMbPlus = 1 * 1024 * 1024 + 1
    const form = formDataWithFile({
      fileContent: new Blob([new Uint8Array(oneMbPlus)]),
      size: oneMbPlus,
    })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(413)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('accepts files at exactly 1MB (413 boundary)', async () => {
    const exactlyOneMb = 1 * 1024 * 1024
    const form = formDataWithFile({
      fileContent: new Blob([new Uint8Array(exactlyOneMb)]),
      size: exactlyOneMb,
    })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(201)
  })

  it('rejects invalid documentType (400)', async () => {
    const form = formDataWithFile({ documentType: 'invalid_type' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('succeeds when documentType is absent (defaults to unknown)', async () => {
    mocks.mockInsertSourceDocument.mockResolvedValue({
      id: 'doc-uuid',
      filePath: 'documents/user-123/documents/test.pdf',
    })
    const form = formDataWithFile({ documentType: null })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(201)
    expect(mocks.mockUpload).toHaveBeenCalledWith(
      'documents/user-123/documents/test.pdf',
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    )
  })

  it('returns 409 with existingUploadId when an active hash already exists', async () => {
    mocks.mockFindSourceDocumentByHash.mockResolvedValue(
      { id: 'existing-id', filePath: 'documents/user-123/pm_statements/existing.pdf' }
    )
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.existingUploadId).toBe('existing-id')
    expect(json.error).toBeTruthy()
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('returns isDuplicate: false and correct shape on new upload', async () => {
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.isDuplicate).toBe(false)
    expect(json.sourceDocumentId).toBe('doc-uuid')
    expect(json.filePath).toBe('documents/user-123/pm_statements/test.pdf')
    expect(mocks.mockUpload).toHaveBeenCalledWith(
      'documents/user-123/pm_statements/test.pdf',
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    )
  })

  it('does not call storage.upload when duplicate detected', async () => {
    mocks.mockFindSourceDocumentByHash.mockResolvedValue(
      { id: 'existing-id', filePath: 'documents/user-123/pm_statements/existing.pdf' }
    )
    const form = formDataWithFile({})
    await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('calls findSourceDocumentByHash with userId from session', async () => {
    const form = formDataWithFile({})
    await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(mocks.mockFindSourceDocumentByHash).toHaveBeenCalledWith(
      'user-123',
      expect.any(String),
    )
  })

  it('deletes storage object if DB insert fails and returns 500', async () => {
    mocks.mockInsertSourceDocument.mockRejectedValue(new Error('DB error'))
    const form = formDataWithFile({ fileName: 'cleanup-test.pdf' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(500)
    expect(mocks.mockRemove).toHaveBeenCalledWith(['documents/user-123/pm_statements/cleanup-test.pdf'])
  })

  it('returns 409 with existingUploadId on unique constraint (race)', async () => {
    mocks.mockFindSourceDocumentByHash
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing-id',
        filePath: 'documents/user-123/pm_statements/test.pdf',
      })
    mocks.mockInsertSourceDocument.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: '23505' })
    )
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.existingUploadId).toBe('existing-id')
    expect(mocks.mockRemove).toHaveBeenCalledWith(['documents/user-123/pm_statements/test.pdf'])
  })

  it('retries storage upload with upsert:true when the first write 409s after the hash check passed', async () => {
    // Orphaned storage object from a prior void whose best-effort delete failed (KTD-3).
    mocks.mockUpload
      .mockResolvedValueOnce({ error: { statusCode: '409', message: 'exists' } })
      .mockResolvedValueOnce({ error: null })
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(201)
    expect(mocks.mockUpload).toHaveBeenCalledTimes(2)
    expect(mocks.mockUpload).toHaveBeenLastCalledWith(
      'documents/user-123/pm_statements/test.pdf',
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: true }
    )
  })

  it('persists replacesSourceDocumentId when it references a caller-owned upload', async () => {
    const replacesId = '11111111-1111-4111-8111-111111111111'
    mocks.mockFindOwnedSourceDocumentAnyStatus.mockResolvedValue({ id: replacesId, userId: 'user-123' })
    const form = formDataWithFile({ replacesSourceDocumentId: replacesId })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(201)
    expect(mocks.mockFindOwnedSourceDocumentAnyStatus).toHaveBeenCalledWith('user-123', replacesId)
    expect(mocks.mockInsertSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({ replacesSourceDocumentId: replacesId })
    )
  })

  it('returns 404 when replacesSourceDocumentId is not owned by the caller (cross-user isolation)', async () => {
    const replacesId = '22222222-2222-4222-8222-222222222222'
    mocks.mockFindOwnedSourceDocumentAnyStatus.mockResolvedValue(null)
    const form = formDataWithFile({ replacesSourceDocumentId: replacesId })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(404)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
    expect(mocks.mockInsertSourceDocument).not.toHaveBeenCalled()
  })

  it('returns 400 when replacesSourceDocumentId is not a valid UUID', async () => {
    const form = formDataWithFile({ replacesSourceDocumentId: 'not-a-uuid' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })
})
