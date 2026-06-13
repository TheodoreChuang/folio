import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/v1/properties/[id]/management-agents/route'
import { DELETE } from '@/app/api/v1/properties/[id]/management-agents/[agentId]/route'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const AGENT_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const propRow = {
  id: PROP_ID,
  userId: 'user-123',
  address: '1 Test St',
  nickname: null,
  createdAt: new Date(),
}

const agentRow = {
  id: AGENT_ID,
  userId: 'user-123',
  propertyId: PROP_ID,
  agencyName: 'Best Realty',
  contactName: 'Jane Smith',
  phone: '0400 000 000',
  email: 'jane@bestrealty.com',
  feePercent: '6.60',
  statementCadence: 'monthly' as const,
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  createdAt: new Date(),
  deletedAt: null,
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindPropertyById: vi.fn(),
  mockListManagementAgents: vi.fn(),
  mockAddManagementAgent: vi.fn(),
  mockRemoveManagementAgent: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/property', () => ({
  findPropertyById: mocks.mockFindPropertyById,
  listManagementAgents: mocks.mockListManagementAgents,
  addManagementAgent: mocks.mockAddManagementAgent,
  removeManagementAgent: mocks.mockRemoveManagementAgent,
}))

vi.mock('@/lib/api-error', () => ({
  captureError: vi.fn(),
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}
function makeAgentParams(id: string, agentId: string) {
  return { params: Promise.resolve({ id, agentId }) }
}
function makeGetRequest() {
  return new Request(`http://localhost/api/properties/${PROP_ID}/management-agents`, { method: 'GET' })
}
function makePostRequest(body: unknown) {
  return new Request(`http://localhost/api/properties/${PROP_ID}/management-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function makeDeleteRequest() {
  return new Request(
    `http://localhost/api/properties/${PROP_ID}/management-agents/${AGENT_ID}`,
    { method: 'DELETE' }
  )
}

const validPostBody = {
  agencyName: 'Best Realty',
  statementCadence: 'monthly',
  effectiveFrom: '2025-01-01',
}

describe('GET /api/properties/[id]/management-agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindPropertyById.mockResolvedValue(propRow)
    mocks.mockListManagementAgents.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await GET(makeGetRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockFindPropertyById.mockResolvedValue(undefined)
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 with empty agents array when none exist', async () => {
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.agents).toEqual([])
  })

  it('returns 200 with agents list when populated', async () => {
    mocks.mockListManagementAgents.mockResolvedValue([agentRow])
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.agents).toHaveLength(1)
    expect(json.agents[0].agencyName).toBe('Best Realty')
  })
})

describe('POST /api/properties/[id]/management-agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockAddManagementAgent.mockResolvedValue(agentRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(validPostBody), makeParams(PROP_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await POST(makePostRequest(validPostBody), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 when agencyName is missing', async () => {
    const { agencyName: _a, ...body } = validPostBody
    const res = await POST(makePostRequest(body), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/agencyName/i)
  })

  it('returns 400 when statementCadence is missing', async () => {
    const { statementCadence: _s, ...body } = validPostBody
    const res = await POST(makePostRequest(body), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/statementCadence/i)
  })

  it('returns 400 when statementCadence is invalid', async () => {
    const res = await POST(makePostRequest({ ...validPostBody, statementCadence: 'daily' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/statementCadence/i)
  })

  it('returns 400 when effectiveFrom is missing', async () => {
    const { effectiveFrom: _e, ...body } = validPostBody
    const res = await POST(makePostRequest(body), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/effectiveFrom/i)
  })

  it('returns 404 when addManagementAgent throws Property not found', async () => {
    mocks.mockAddManagementAgent.mockRejectedValue(new Error('Property not found'))
    const res = await POST(makePostRequest(validPostBody), makeParams(PROP_ID))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/not found/i)
  })

  it('returns 201 with agent on valid body', async () => {
    const res = await POST(makePostRequest(validPostBody), makeParams(PROP_ID))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.agent.id).toBe(AGENT_ID)
    expect(json.agent.agencyName).toBe('Best Realty')
  })

  it('accepts feePercent as a decimal string', async () => {
    mocks.mockAddManagementAgent.mockResolvedValue({ ...agentRow, feePercent: '6.6' })
    const res = await POST(makePostRequest({ ...validPostBody, feePercent: '6.6' }), makeParams(PROP_ID))
    expect(res.status).toBe(201)
    expect(mocks.mockAddManagementAgent).toHaveBeenCalledWith(
      'user-123',
      PROP_ID,
      expect.objectContaining({ feePercent: '6.6' })
    )
  })

  it('accepts feePercent as a number and converts to string', async () => {
    mocks.mockAddManagementAgent.mockResolvedValue({ ...agentRow, feePercent: '6.6' })
    const res = await POST(makePostRequest({ ...validPostBody, feePercent: 6.6 }), makeParams(PROP_ID))
    expect(res.status).toBe(201)
    expect(mocks.mockAddManagementAgent).toHaveBeenCalledWith(
      'user-123',
      PROP_ID,
      expect.objectContaining({ feePercent: '6.6' })
    )
  })
})

describe('DELETE /api/properties/[id]/management-agents/[agentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockRemoveManagementAgent.mockResolvedValue(agentRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeAgentParams(PROP_ID, AGENT_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeAgentParams('not-a-uuid', AGENT_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for invalid agent UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeAgentParams(PROP_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid agent/i)
  })

  it('returns 404 when removeManagementAgent returns undefined', async () => {
    mocks.mockRemoveManagementAgent.mockResolvedValue(undefined)
    const res = await DELETE(makeDeleteRequest(), makeAgentParams(PROP_ID, AGENT_ID))
    expect(res.status).toBe(404)
  })

  it('passes propertyId to removeManagementAgent for cross-property isolation', async () => {
    await DELETE(makeDeleteRequest(), makeAgentParams(PROP_ID, AGENT_ID))
    expect(mocks.mockRemoveManagementAgent).toHaveBeenCalledWith('user-123', PROP_ID, AGENT_ID)
  })

  it('returns 200 with success true on successful delete', async () => {
    const res = await DELETE(makeDeleteRequest(), makeAgentParams(PROP_ID, AGENT_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
