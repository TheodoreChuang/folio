import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/properties/[id]/tenancies/route'
import { DELETE } from '@/app/api/properties/[id]/tenancies/[tenancyId]/route'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const TENANCY_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const USER_ID = 'user-123'

const propRow = {
  id: PROP_ID,
  userId: USER_ID,
  address: '1 Test St',
  nickname: null,
  createdAt: new Date(),
}

const tenancyRow = {
  id: TENANCY_ID,
  userId: USER_ID,
  propertyId: PROP_ID,
  tenants: 'Jane Doe',
  leaseType: 'fixed_term' as const,
  leaseStart: '2025-01-01',
  leaseEnd: '2026-01-01',
  weeklyRentCents: 50000,
  bondCents: 200000,
  createdAt: new Date(),
  deletedAt: null,
}

vi.mock('@/lib/property', () => ({
  findPropertyById: vi.fn(),
  listTenancies: vi.fn(),
  addTenancy: vi.fn(),
  removeTenancy: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/api-error', () => ({
  captureError: vi.fn(),
}))

import {
  findPropertyById,
  listTenancies,
  addTenancy,
  removeTenancy,
} from '@/lib/property'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function mockAuth(userId: string | null = USER_ID) {
  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  }
  ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase)
}

function makeGetRequest() {
  return new Request(`http://localhost/api/properties/${PROP_ID}/tenancies`, { method: 'GET' })
}

function makePostRequest(body: unknown) {
  return new Request(`http://localhost/api/properties/${PROP_ID}/tenancies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest() {
  return new Request(
    `http://localhost/api/properties/${PROP_ID}/tenancies/${TENANCY_ID}`,
    { method: 'DELETE' }
  )
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeTenancyParams(id: string, tenancyId: string) {
  return { params: Promise.resolve({ id, tenancyId }) }
}

describe('GET /api/properties/[id]/tenancies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    ;(findPropertyById as ReturnType<typeof vi.fn>).mockResolvedValue(propRow)
    ;(listTenancies as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await GET(makeGetRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 404 when findPropertyById returns undefined', async () => {
    ;(findPropertyById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(404)
  })

  it('returns empty tenancies list', async () => {
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tenancies).toEqual([])
  })

  it('returns populated tenancies list', async () => {
    const t1 = { ...tenancyRow, id: 'id-1' }
    const t2 = { ...tenancyRow, id: 'id-2' }
    ;(listTenancies as ReturnType<typeof vi.fn>).mockResolvedValue([t1, t2])
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tenancies).toHaveLength(2)
    expect(json.tenancies[0].id).toBe('id-1')
    expect(json.tenancies[1].id).toBe('id-2')
  })
})

describe('POST /api/properties/[id]/tenancies', () => {
  const validBody = {
    leaseType: 'fixed_term',
    leaseStart: '2025-01-01',
    weeklyRentCents: 50000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    ;(addTenancy as ReturnType<typeof vi.fn>).mockResolvedValue(tenancyRow)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing leaseType', async () => {
    const { leaseType: _lt, ...body } = validBody
    const res = await POST(makePostRequest(body), makeParams(PROP_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing leaseStart', async () => {
    const { leaseStart: _ls, ...body } = validBody
    const res = await POST(makePostRequest(body), makeParams(PROP_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing weeklyRentCents', async () => {
    const { weeklyRentCents: _wr, ...body } = validBody
    const res = await POST(makePostRequest(body), makeParams(PROP_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid leaseType', async () => {
    const res = await POST(makePostRequest({ ...validBody, leaseType: 'month_to_month' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
  })

  it('returns 404 when addTenancy throws Property not found', async () => {
    ;(addTenancy as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Property not found'))
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Not found')
  })

  it('returns 201 with tenancy on valid body', async () => {
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.tenancy.id).toBe(TENANCY_ID)
    expect(json.tenancy.weeklyRentCents).toBe(50000)
  })
})

describe('DELETE /api/properties/[id]/tenancies/[tenancyId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    ;(removeTenancy as ReturnType<typeof vi.fn>).mockResolvedValue(tenancyRow)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth(null)
    const res = await DELETE(makeDeleteRequest(), makeTenancyParams(PROP_ID, TENANCY_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeTenancyParams('not-a-uuid', TENANCY_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for invalid tenancy UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeTenancyParams(PROP_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid tenancy/i)
  })

  it('returns 404 when removeTenancy returns undefined', async () => {
    ;(removeTenancy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const res = await DELETE(makeDeleteRequest(), makeTenancyParams(PROP_ID, TENANCY_ID))
    expect(res.status).toBe(404)
  })

  it('passes propertyId to removeTenancy for cross-property isolation', async () => {
    await DELETE(makeDeleteRequest(), makeTenancyParams(PROP_ID, TENANCY_ID))
    expect(removeTenancy as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(USER_ID, PROP_ID, TENANCY_ID)
  })

  it('returns success true on successful delete', async () => {
    const res = await DELETE(makeDeleteRequest(), makeTenancyParams(PROP_ID, TENANCY_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
