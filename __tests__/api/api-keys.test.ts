import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/v1/api-keys/route'
import { DELETE } from '@/app/api/v1/api-keys/[id]/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListApiKeys: vi.fn(),
  mockCreateApiKey: vi.fn(),
  mockCountActiveApiKeys: vi.fn(),
  mockRevokeApiKey: vi.fn(),
  mockFindApiKeyByHash: vi.fn(),
  mockTouchLastUsed: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/api-keys', () => ({
  listApiKeys: mocks.mockListApiKeys,
  createApiKey: mocks.mockCreateApiKey,
  countActiveApiKeys: mocks.mockCountActiveApiKeys,
  revokeApiKey: mocks.mockRevokeApiKey,
  findApiKeyByHash: mocks.mockFindApiKeyByHash,
  touchLastUsed: mocks.mockTouchLastUsed,
}))

const VALID_KEY_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const USER_ID = 'user-123'

const keyRow = {
  id: VALID_KEY_ID,
  userId: USER_ID,
  name: 'My Claude key',
  keyHash: 'abc123hash',
  keyPrefix: 'sk_live_ab',
  lastUsedAt: null,
  createdAt: new Date('2026-06-13T00:00:00Z'),
  revokedAt: null,
}

function makeRequest(method: string, body?: unknown, id?: string, bearerToken?: string) {
  const url = id
    ? `http://localhost/api/v1/api-keys/${id}`
    : 'http://localhost/api/v1/api-keys'
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/v1/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.mockListApiKeys.mockResolvedValue([keyRow])
    mocks.mockTouchLastUsed.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is unknown', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(null)
    const res = await GET(makeRequest('GET', undefined, undefined, 'sk_live_unknown'))
    expect(res.status).toBe(401)
    expect(mocks.mockTouchLastUsed).not.toHaveBeenCalled()
  })

  it('returns 403 when authenticated via bearer token', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(keyRow)
    const res = await GET(makeRequest('GET', undefined, undefined, 'sk_live_testtoken123456'))
    expect(res.status).toBe(403)
    expect(mocks.mockListApiKeys).not.toHaveBeenCalled()
    expect(mocks.mockTouchLastUsed).toHaveBeenCalledWith(keyRow.id)
  })

  it('returns list of keys without keyHash', async () => {
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(200)
    const { apiKeys } = await res.json()
    expect(apiKeys).toHaveLength(1)
    expect(apiKeys[0].id).toBe(VALID_KEY_ID)
    expect(apiKeys[0].name).toBe('My Claude key')
    expect(apiKeys[0].keyPrefix).toBe('sk_live_ab')
    expect(apiKeys[0]).not.toHaveProperty('keyHash')
  })

  it('calls listApiKeys with the authenticated userId', async () => {
    await GET(makeRequest('GET'))
    expect(mocks.mockListApiKeys).toHaveBeenCalledWith(USER_ID)
  })
})

describe('POST /api/v1/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.mockCreateApiKey.mockResolvedValue(keyRow)
    mocks.mockCountActiveApiKeys.mockResolvedValue(0)
    mocks.mockTouchLastUsed.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('POST', { name: 'test' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is unknown', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(null)
    const res = await POST(makeRequest('POST', { name: 'new key' }, undefined, 'sk_live_unknown'))
    expect(res.status).toBe(401)
    expect(mocks.mockTouchLastUsed).not.toHaveBeenCalled()
  })

  it('returns 403 when authenticated via bearer token', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(keyRow)
    const res = await POST(makeRequest('POST', { name: 'new key' }, undefined, 'sk_live_testtoken123456'))
    expect(res.status).toBe(403)
    expect(mocks.mockCreateApiKey).not.toHaveBeenCalled()
    expect(mocks.mockTouchLastUsed).toHaveBeenCalledWith(keyRow.id)
  })

  it('returns 400 when key limit is reached', async () => {
    mocks.mockCountActiveApiKeys.mockResolvedValue(10)
    const res = await POST(makeRequest('POST', { name: 'One too many' }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/limit/i)
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', {}))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/name/i)
  })

  it('returns 400 when name is empty', async () => {
    const res = await POST(makeRequest('POST', { name: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await POST(makeRequest('POST', { name: 'A'.repeat(101) }))
    expect(res.status).toBe(400)
  })

  it('returns 201 with key on creation (key exposed once)', async () => {
    const res = await POST(makeRequest('POST', { name: 'My Claude key' }))
    expect(res.status).toBe(201)
    const { apiKey } = await res.json()
    expect(apiKey.key).toMatch(/^sk_live_/)
    expect(apiKey.id).toBe(VALID_KEY_ID)
    expect(apiKey.name).toBe('My Claude key')
  })

  it('calls createApiKey with userId and name', async () => {
    await POST(makeRequest('POST', { name: 'My Claude key' }))
    expect(mocks.mockCreateApiKey).toHaveBeenCalledWith(
      USER_ID,
      'My Claude key',
      expect.any(String),
      expect.stringMatching(/^sk_live_/),
    )
  })
})

describe('DELETE /api/v1/api-keys/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.mockRevokeApiKey.mockResolvedValue(true)
    mocks.mockTouchLastUsed.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest('DELETE', undefined, VALID_KEY_ID), {
      params: Promise.resolve({ id: VALID_KEY_ID }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is unknown', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(null)
    const res = await DELETE(
      makeRequest('DELETE', undefined, VALID_KEY_ID, 'sk_live_unknown'),
      { params: Promise.resolve({ id: VALID_KEY_ID }) },
    )
    expect(res.status).toBe(401)
    expect(mocks.mockTouchLastUsed).not.toHaveBeenCalled()
  })

  it('returns 403 when authenticated via bearer token', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(keyRow)
    const res = await DELETE(
      makeRequest('DELETE', undefined, VALID_KEY_ID, 'sk_live_testtoken123456'),
      { params: Promise.resolve({ id: VALID_KEY_ID }) },
    )
    expect(res.status).toBe(403)
    expect(mocks.mockRevokeApiKey).not.toHaveBeenCalled()
    expect(mocks.mockTouchLastUsed).toHaveBeenCalledWith(keyRow.id)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, 'not-a-uuid'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when key not found or belongs to another user', async () => {
    mocks.mockRevokeApiKey.mockResolvedValue(false)
    const res = await DELETE(makeRequest('DELETE', undefined, VALID_KEY_ID), {
      params: Promise.resolve({ id: VALID_KEY_ID }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 success when key revoked', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, VALID_KEY_ID), {
      params: Promise.resolve({ id: VALID_KEY_ID }),
    })
    expect(res.status).toBe(200)
    const { success } = await res.json()
    expect(success).toBe(true)
  })

  it('calls revokeApiKey with keyId and userId (prevents cross-user revocation)', async () => {
    await DELETE(makeRequest('DELETE', undefined, VALID_KEY_ID), {
      params: Promise.resolve({ id: VALID_KEY_ID }),
    })
    expect(mocks.mockRevokeApiKey).toHaveBeenCalledWith(VALID_KEY_ID, USER_ID)
  })
})
