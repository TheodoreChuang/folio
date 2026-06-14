import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveUser } from '@/lib/api-auth'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindApiKeyByHash: vi.fn(),
  mockTouchLastUsed: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/api-keys', () => ({
  findApiKeyByHash: mocks.mockFindApiKeyByHash,
  touchLastUsed: mocks.mockTouchLastUsed,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], setAll: () => {} }),
}))

const USER_ID = 'user-abc-123'
const KEY_ROW = {
  id: 'key-id-1',
  userId: USER_ID,
  name: 'test key',
  keyHash: 'abc',
  keyPrefix: 'sk_live_ab',
  lastUsedAt: null,
  createdAt: new Date(),
  revokedAt: null,
}

function bearerRequest(token: string) {
  return new Request('http://localhost/api/v1/entities', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function cookieRequest() {
  return new Request('http://localhost/api/v1/entities')
}

describe('resolveUser — bearer auth path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockTouchLastUsed.mockResolvedValue(undefined)
  })

  it('returns user when sk_live_ token matches a key', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(KEY_ROW)
    const result = await resolveUser(bearerRequest('sk_live_validtoken'))
    expect(result).toEqual({ id: USER_ID, authMethod: 'bearer' })
    expect(mocks.mockTouchLastUsed).toHaveBeenCalledWith(KEY_ROW.id)
  })

  it('returns null when sk_live_ token has no matching key', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(null)
    const result = await resolveUser(bearerRequest('sk_live_unknown'))
    expect(result).toBeNull()
    expect(mocks.mockTouchLastUsed).not.toHaveBeenCalled()
  })

  it('returns null when bearer token lacks sk_live_ prefix', async () => {
    const result = await resolveUser(bearerRequest('some_other_token'))
    expect(result).toBeNull()
    expect(mocks.mockFindApiKeyByHash).not.toHaveBeenCalled()
    expect(mocks.mockGetUser).not.toHaveBeenCalled()
  })

  it('accepts lowercase bearer scheme (RFC 7235 case-insensitive)', async () => {
    mocks.mockFindApiKeyByHash.mockResolvedValue(KEY_ROW)
    const request = new Request('http://localhost/api/v1/entities', {
      headers: { Authorization: 'bearer sk_live_validtoken' },
    })
    const result = await resolveUser(request)
    expect(result).toEqual({ id: USER_ID, authMethod: 'bearer' })
  })

  it('returns null for non-bearer Authorization scheme (e.g. Basic)', async () => {
    const request = new Request('http://localhost/api/v1/entities', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
    const result = await resolveUser(request)
    expect(result).toBeNull()
    expect(mocks.mockFindApiKeyByHash).not.toHaveBeenCalled()
    expect(mocks.mockGetUser).not.toHaveBeenCalled()
  })

  it('does not fall through to cookie auth when any Authorization header is present', async () => {
    const request = new Request('http://localhost/api/v1/entities', {
      headers: { Authorization: 'Bearer some_non_folio_token' },
    })
    const result = await resolveUser(request)
    expect(result).toBeNull()
    expect(mocks.mockGetUser).not.toHaveBeenCalled()
  })
})

describe('resolveUser — cookie auth path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user when cookie session is valid', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const result = await resolveUser(cookieRequest())
    expect(result).toEqual({ id: USER_ID, authMethod: 'cookie' })
  })

  it('returns null when no cookie session exists', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await resolveUser(cookieRequest())
    expect(result).toBeNull()
  })
})
