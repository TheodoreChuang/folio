import { createHash } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export interface ResolvedUser {
  id: string
  authMethod: 'bearer' | 'cookie'
}

export async function resolveUser(request?: Request): Promise<ResolvedUser | null> {
  const authHeader = request?.headers.get('Authorization')

  if (authHeader?.startsWith('Bearer sk_live_')) {
    const token = authHeader.slice(7)
    const hash = createHash('sha256').update(token).digest('hex')
    // Dynamic import keeps @/lib/db out of the module graph for cookie-auth paths,
    // which prevents test environments without DATABASE_URL from breaking.
    const { findApiKeyByHash, touchLastUsed } = await import('@/lib/api-keys')
    const apiKey = await findApiKeyByHash(hash)
    if (!apiKey) return null
    Promise.resolve(touchLastUsed(apiKey.id)).catch(err => logger.error('touchLastUsed failed', { keyId: apiKey.id, err }))
    return { id: apiKey.userId, authMethod: 'bearer' }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { id: user.id, authMethod: 'cookie' }
}
