import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/documents/route'

const docRow = {
  id: 'doc-uuid-1111-1111-1111-111111111111',
  fileName: 'jan-statement.pdf',
  propertyId: 'prop-uuid-2222-2222-2222-222222222222',
  uploadedAt: new Date('2026-01-15T10:00:00Z'),
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListDocumentsForMonth: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  listDocumentsForMonth: (...args: unknown[]) => mocks.mockListDocumentsForMonth(...args),
}))

function makeGetRequest(month?: string) {
  const url = month
    ? `http://localhost/api/documents?month=${month}`
    : 'http://localhost/api/documents'
  return new Request(url, { method: 'GET' })
}

describe('GET /api/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListDocumentsForMonth.mockResolvedValue([])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when month param is missing', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/missing/i)
  })

  it('returns 400 for invalid month format (2026/03)', async () => {
    const res = await GET(makeGetRequest('2026/03'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid month/i)
  })

  it('returns 200 with empty documents array when no linked docs', async () => {
    mocks.mockListDocumentsForMonth.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('returns 200 with correct shape for matching docs', async () => {
    mocks.mockListDocumentsForMonth.mockResolvedValue([docRow])
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
    mocks.mockListDocumentsForMonth.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-02'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('RLS: calls listDocumentsForMonth with userId from session', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockListDocumentsForMonth.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    expect(mocks.mockListDocumentsForMonth).toHaveBeenCalledWith(
      'user-B',
      expect.any(String),
      expect.any(String),
    )
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('de-duplicates: same doc across multiple entries returns one entry', async () => {
    mocks.mockListDocumentsForMonth.mockResolvedValue([docRow])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toHaveLength(1)
    expect(json.documents[0].id).toBe(docRow.id)
  })
})
