import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/v1/documents/route'

const docRow = {
  id: 'doc-uuid-1111-1111-1111-111111111111',
  fileName: 'jan-statement.pdf',
  propertyId: 'prop-uuid-2222-2222-2222-222222222222',
  uploadedAt: new Date('2026-01-15T10:00:00Z'),
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListDocumentsForDateRange: vi.fn(),
  mockListDocumentsForProperty: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  listDocumentsForDateRange: (...args: unknown[]) => mocks.mockListDocumentsForDateRange(...args),
  listDocumentsForProperty: (...args: unknown[]) => mocks.mockListDocumentsForProperty(...args),
}))

function makeGetRequest(month?: string, propertyId?: string) {
  const params = new URLSearchParams()
  if (month) params.set('month', month)
  if (propertyId) params.set('propertyId', propertyId)
  const qs = params.toString()
  const url = qs ? `http://localhost/api/documents?${qs}` : 'http://localhost/api/documents'
  return new Request(url, { method: 'GET' })
}

describe('GET /api/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListDocumentsForDateRange.mockResolvedValue([])
    mocks.mockListDocumentsForProperty.mockResolvedValue([])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid month format (2026/03)', async () => {
    const res = await GET(makeGetRequest('2026/03'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid month/i)
  })

  it('returns 200 with empty documents array when no linked docs', async () => {
    mocks.mockListDocumentsForDateRange.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('returns 200 with correct shape for matching docs', async () => {
    mocks.mockListDocumentsForDateRange.mockResolvedValue([docRow])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toHaveLength(1)
    expect(json.documents[0]).toMatchObject({
      id: docRow.id,
      fileName: docRow.fileName,
      propertyId: docRow.propertyId,
    })
    expect(json.documents[0].uploadedAt).toBeDefined()
  })

  it('returns empty array for a month with no docs (another month excluded)', async () => {
    mocks.mockListDocumentsForDateRange.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-02'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('RLS: calls listDocumentsForDateRange with userId from session', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockListDocumentsForDateRange.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    expect(mocks.mockListDocumentsForDateRange).toHaveBeenCalledWith(
      'user-B',
      expect.any(String),
      expect.any(String),
    )
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('de-duplicates: same doc across multiple entries returns one entry', async () => {
    mocks.mockListDocumentsForDateRange.mockResolvedValue([docRow])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toHaveLength(1)
    expect(json.documents[0].id).toBe(docRow.id)
  })

  it('returns full upload history via listDocumentsForProperty when month is omitted', async () => {
    const summaryRow = { ...docRow, status: 'voided', periodStart: '2026-01-01', periodEnd: '2026-01-31', replacesSourceDocumentId: null }
    mocks.mockListDocumentsForProperty.mockResolvedValue([summaryRow])
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(mocks.mockListDocumentsForDateRange).not.toHaveBeenCalled()
    expect(mocks.mockListDocumentsForProperty).toHaveBeenCalledWith('user-123', undefined)
    expect(json.documents).toEqual([{ ...summaryRow, uploadedAt: summaryRow.uploadedAt.toISOString() }])
  })

  it('passes propertyId through to listDocumentsForProperty when month is omitted', async () => {
    const propertyId = 'a1b2c3d4-e5f6-4789-a012-345678901234'
    const res = await GET(makeGetRequest(undefined, propertyId))
    expect(res.status).toBe(200)
    expect(mocks.mockListDocumentsForProperty).toHaveBeenCalledWith('user-123', propertyId)
  })

  it('returns 400 for a malformed propertyId', async () => {
    const res = await GET(makeGetRequest(undefined, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propertyId/i)
    expect(mocks.mockListDocumentsForProperty).not.toHaveBeenCalled()
  })

  it('RLS: calls listDocumentsForProperty with userId from session when month is omitted', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    expect(mocks.mockListDocumentsForProperty).toHaveBeenCalledWith('user-B', undefined)
  })
})
