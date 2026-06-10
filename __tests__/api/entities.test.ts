import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/entities/route'
import { PATCH, DELETE } from '@/app/api/entities/[id]/route'

const ENTITY_ID = 'cccc0001-0000-4000-c000-000000000001'

const entityRow = { id: ENTITY_ID, userId: 'user-123', name: 'Personal', type: 'individual' as const, createdAt: new Date() }

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListEntities: vi.fn(),
  mockCreateEntity: vi.fn(),
  mockUpdateEntity: vi.fn(),
  mockDeleteEntity: vi.fn(),
  mockHasPropertyForEntity: vi.fn(),
  mockHasLoanForEntity: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/entities', () => ({
  listEntities: mocks.mockListEntities,
  createEntity: mocks.mockCreateEntity,
  updateEntity: mocks.mockUpdateEntity,
  deleteEntity: mocks.mockDeleteEntity,
  findEntityById: vi.fn(),
}))

vi.mock('@/lib/property', () => ({
  hasPropertyForEntity: mocks.mockHasPropertyForEntity,
}))

vi.mock('@/lib/borrowings', () => ({
  hasLoanForEntity: mocks.mockHasLoanForEntity,
}))

function makeRequest(method: string, body?: unknown, id?: string) {
  const url = id
    ? `http://localhost/api/entities/${id}`
    : 'http://localhost/api/entities'
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListEntities.mockResolvedValue([entityRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 200 with entities list', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const { entities } = await res.json()
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe('Personal')
    expect(mocks.mockListEntities).toHaveBeenCalledWith('user-123')
  })
})

describe('POST /api/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockCreateEntity.mockResolvedValue(entityRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('POST', { name: 'Test', type: 'individual' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', { type: 'individual' }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/name/i)
  })

  it('returns 400 when type is invalid', async () => {
    const res = await POST(makeRequest('POST', { name: 'Test', type: 'invalid' }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/type/i)
  })

  it('returns 201 with entity on success', async () => {
    const res = await POST(makeRequest('POST', { name: 'Personal', type: 'individual' }))
    expect(res.status).toBe(201)
    const { entity } = await res.json()
    expect(entity.name).toBe('Personal')
    expect(mocks.mockCreateEntity).toHaveBeenCalledWith('user-123', 'Personal', 'individual')
  })

  it('accepts all valid entity types', async () => {
    const types = ['individual', 'joint', 'trust', 'company', 'superannuation'] as const
    for (const type of types) {
      mocks.mockCreateEntity.mockResolvedValue({ ...entityRow, type })
      const res = await POST(makeRequest('POST', { name: 'Test', type }))
      expect(res.status).toBe(201)
    }
  })
})

describe('PATCH /api/entities/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateEntity.mockResolvedValue(entityRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest('PATCH', { name: 'New name' }, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: 'New name' }, 'not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is missing', async () => {
    const res = await PATCH(makeRequest('PATCH', {}, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when entity not found', async () => {
    mocks.mockUpdateEntity.mockResolvedValue(undefined)
    const res = await PATCH(makeRequest('PATCH', { name: 'New' }, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated entity', async () => {
    const updated = { ...entityRow, name: 'Family Trust' }
    mocks.mockUpdateEntity.mockResolvedValue(updated)
    const res = await PATCH(makeRequest('PATCH', { name: 'Family Trust' }, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(200)
    const { entity } = await res.json()
    expect(entity.name).toBe('Family Trust')
    expect(mocks.mockUpdateEntity).toHaveBeenCalledWith('user-123', ENTITY_ID, 'Family Trust')
  })
})

describe('DELETE /api/entities/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockHasPropertyForEntity.mockResolvedValue(false)
    mocks.mockHasLoanForEntity.mockResolvedValue(false)
    mocks.mockDeleteEntity.mockResolvedValue(entityRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, 'bad'), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when entity has assigned properties', async () => {
    mocks.mockHasPropertyForEntity.mockResolvedValue(true)
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error).toMatch(/reassign/i)
  })

  it('returns 409 when entity has assigned loans', async () => {
    mocks.mockHasLoanForEntity.mockResolvedValue(true)
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(409)
  })

  it('returns 404 when entity not found', async () => {
    mocks.mockDeleteEntity.mockResolvedValue(undefined)
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 success when entity deleted', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mocks.mockDeleteEntity).toHaveBeenCalledWith('user-123', ENTITY_ID)
  })
})
