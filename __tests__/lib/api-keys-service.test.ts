import { describe, it, expect } from 'vitest'
import { generateApiKey } from '@/lib/api-keys/services/api-keys'

describe('generateApiKey', () => {
  it('returns a raw token with sk_live_ prefix', () => {
    const { rawToken } = generateApiKey()
    expect(rawToken).toMatch(/^sk_live_/)
  })

  it('keyPrefix is the first 14 characters of rawToken', () => {
    const { rawToken, keyPrefix } = generateApiKey()
    expect(keyPrefix).toBe(rawToken.slice(0, 14))
  })

  it('keyHash is a 64-char hex SHA-256 string', () => {
    const { keyHash } = generateApiKey()
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique tokens on each call', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.rawToken).not.toBe(b.rawToken)
    expect(a.keyHash).not.toBe(b.keyHash)
  })
})
