import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/v1/properties/[id]/entries/route'

const propRow = {
  id: 'a1b2c3d4-e5f6-4789-a012-111111111111',
  userId: 'user-123',
  address: '123 Smith St, Sydney NSW 2000',
  nickname: null,
  createdAt: new Date(),
}

const entryRow = {
  id: 'e1111111-1111-4111-a111-111111111111',
  userId: 'user-123',
  propertyId: propRow.id,
  sourceDocumentId: null,
  installmentLoanId: null,
  lineItemDate: '2026-03-15',
  amountCents: 120000,
  category: 'insurance',
  description: 'Building insurance renewal',
  userNotes: null,
  createdAt: new Date(),
}

const VALID_PROP_ID = propRow.id

function makeGetRequest(propertyId: string, month?: string) {
  const qs = month !== undefined ? `?month=${encodeURIComponent(month)}` : ''
  return new Request(`http://localhost/api/properties/${propertyId}/entries${qs}`, {
    method: 'GET',
  })
}

function makePostRequest(propertyId: string, body: unknown) {
  return new Request(`http://localhost/api/properties/${propertyId}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindPropertyById: vi.fn(),
  mockListLedgerEntriesByMonth: vi.fn(),
  mockCreateLedgerEntry: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/property', () => ({
  findPropertyById: mocks.mockFindPropertyById,
  listLedgerEntriesByMonth: mocks.mockListLedgerEntriesByMonth,
  createLedgerEntry: mocks.mockCreateLedgerEntry,
}))

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/properties/[id]/entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindPropertyById.mockResolvedValue(propRow)
    mocks.mockListLedgerEntriesByMonth.mockResolvedValue([entryRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(VALID_PROP_ID, '2026-03'), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await GET(makeGetRequest('not-a-uuid', '2026-03'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 when month param is missing', async () => {
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/month/i)
  })

  it('returns 400 when month param is not YYYY-MM', async () => {
    const res = await GET(makeGetRequest(VALID_PROP_ID, '2026-03-15'), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/month/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockFindPropertyById.mockResolvedValueOnce(undefined)
    const res = await GET(makeGetRequest(VALID_PROP_ID, '2026-03'), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with entries for the month', async () => {
    const res = await GET(makeGetRequest(VALID_PROP_ID, '2026-03'), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toHaveLength(1)
    expect(json.entries[0].category).toBe('insurance')
    expect(mocks.mockListLedgerEntriesByMonth).toHaveBeenCalledWith('user-123', VALID_PROP_ID, '2026-03')
  })

  it('returns 200 with empty entries when none exist for the month', async () => {
    mocks.mockListLedgerEntriesByMonth.mockResolvedValueOnce([])
    const res = await GET(makeGetRequest(VALID_PROP_ID, '2026-03'), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toEqual([])
  })
})

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/properties/[id]/entries', () => {
  const validBody = {
    lineItemDate: '2026-03-15',
    amountCents: 120000,
    category: 'insurance',
    description: 'Building insurance renewal',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindPropertyById.mockResolvedValue(propRow)
    mocks.mockCreateLedgerEntry.mockResolvedValue(entryRow)
  })

  it('returns 201 with created entry on success', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, validBody), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.entry.id).toBe(entryRow.id)
    expect(json.entry.category).toBe('insurance')
    expect(json.entry.amountCents).toBe(120000)
    expect(json.entry.sourceDocumentId).toBeNull()
    expect(json.entry.installmentLoanId).toBeNull()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(VALID_PROP_ID, validBody), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(401)
    expect(mocks.mockCreateLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await POST(makePostRequest('not-a-uuid', validBody), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for loan_payment category', async () => {
    const res = await POST(
      makePostRequest(VALID_PROP_ID, { ...validBody, category: 'loan_payment' }),
      { params: Promise.resolve({ id: VALID_PROP_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/category/i)
    expect(mocks.mockCreateLedgerEntry).not.toHaveBeenCalled()
  })

  it('accepts other_income category', async () => {
    mocks.mockCreateLedgerEntry.mockResolvedValueOnce({ ...entryRow, category: 'other_income' })
    const res = await POST(
      makePostRequest(VALID_PROP_ID, { ...validBody, category: 'other_income' }),
      { params: Promise.resolve({ id: VALID_PROP_ID }) }
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.entry.category).toBe('other_income')
    expect(mocks.mockCreateLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'other_income', userId: 'user-123' })
    )
  })

  it('returns 400 for invalid lineItemDate', async () => {
    const res = await POST(
      makePostRequest(VALID_PROP_ID, { ...validBody, lineItemDate: '2026-03' }),
      { params: Promise.resolve({ id: VALID_PROP_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lineItemDate/i)
  })

  it('returns 400 for amountCents equal to zero', async () => {
    const res = await POST(
      makePostRequest(VALID_PROP_ID, { ...validBody, amountCents: 0 }),
      { params: Promise.resolve({ id: VALID_PROP_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/amountCents/i)
  })

  it('returns 400 for negative amountCents', async () => {
    const res = await POST(
      makePostRequest(VALID_PROP_ID, { ...validBody, amountCents: -100 }),
      { params: Promise.resolve({ id: VALID_PROP_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when description exceeds 500 characters', async () => {
    const res = await POST(
      makePostRequest(VALID_PROP_ID, { ...validBody, description: 'A'.repeat(501) }),
      { params: Promise.resolve({ id: VALID_PROP_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/description/i)
  })

  it('returns 404 when property is not found', async () => {
    mocks.mockFindPropertyById.mockResolvedValueOnce(undefined)
    const res = await POST(makePostRequest(VALID_PROP_ID, validBody), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockCreateLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 404 when property belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockFindPropertyById.mockResolvedValueOnce(undefined)
    const res = await POST(makePostRequest(VALID_PROP_ID, validBody), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockCreateLedgerEntry).not.toHaveBeenCalled()
  })

  it('accepts description as null when omitted', async () => {
    const bodyWithoutDesc = { lineItemDate: '2026-03-15', amountCents: 50000, category: 'rates' }
    mocks.mockCreateLedgerEntry.mockResolvedValueOnce({ ...entryRow, category: 'rates', description: null })
    const res = await POST(makePostRequest(VALID_PROP_ID, bodyWithoutDesc), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.entry.description).toBeNull()
  })
})
