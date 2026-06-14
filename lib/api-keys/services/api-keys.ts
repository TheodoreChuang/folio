import { randomBytes, createHash } from 'crypto'

export function generateApiKey(): { rawToken: string; keyHash: string; keyPrefix: string } {
  const rawToken = `sk_live_${randomBytes(24).toString('base64url')}`
  const keyHash = createHash('sha256').update(rawToken).digest('hex')
  const keyPrefix = rawToken.slice(0, 14)
  return { rawToken, keyHash, keyPrefix }
}
