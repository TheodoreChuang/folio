import { createHash } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface ResolvedUser {
  id: string
  authMethod: 'bearer' | 'cookie'
}

export async function resolveUser(request: Request): Promise<ResolvedUser | null> {
  const authHeader = request.headers.get('Authorization')

  if (authHeader) {
    const lower = authHeader.toLowerCase()
    if (!lower.startsWith('bearer ')) return null
    const token = authHeader.slice(7)
    if (!token.startsWith('sk_live_')) return null
    const hash = createHash('sha256').update(token).digest('hex')
    // Dynamic import keeps @/lib/db out of the module graph for cookie-auth paths,
    // which prevents test environments without DATABASE_URL from breaking.
    const { findApiKeyByHash, touchLastUsed } = await import('@/lib/api-keys')
    const apiKey = await findApiKeyByHash(hash)
    if (!apiKey) return null
    const stale = !apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt.getTime() > 5 * 60 * 1000
    if (stale) touchLastUsed(apiKey.id, apiKey.userId).catch(err => logger.error('touchLastUsed failed', { keyId: apiKey.id, err }))
    return { id: apiKey.userId, authMethod: 'bearer' }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { id: user.id, authMethod: 'cookie' }
}
