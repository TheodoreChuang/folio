import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiKeys } from '@/db/schema'

const refs = vi.hoisted(() => ({
  cookieStore: [] as { name: string; value: string }[],
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => refs.cookieStore,
    setAll: (cookies: { name: string; value: string }[]) => {
      refs.cookieStore.length = 0
      refs.cookieStore.push(...cookies)
    },
  }),
}))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

let userId: string
const createdIds: string[] = []

beforeAll(async () => {
  if (!hasEnv) return

  const anon = createClient(url!, anonKey!)
  const { data: { session }, error } = await anon.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  })
  if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
  userId = session.user.id

  const serverClient = createServerClient(url!, anonKey!, {
    cookies: {
      getAll: () => refs.cookieStore,
      setAll: (cs) => {
        refs.cookieStore.length = 0
        refs.cookieStore.push(...cs)
      },
    },
  })
  await serverClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
})

afterEach(async () => {
  if (!hasEnv || createdIds.length === 0) return
  for (const id of createdIds) {
    await db.delete(apiKeys).where(eq(apiKeys.id, id))
  }
  createdIds.length = 0
})

describe('GET /api/v1/api-keys — revokedAt filter (integration)', () => {
  it('excludes revoked keys from list', async () => {
    if (!hasEnv) return

    const { GET } = await import('@/app/api/v1/api-keys/route')
    const { DELETE } = await import('@/app/api/v1/api-keys/[id]/route')

    // Create two keys directly in the DB
    const [active] = await db.insert(apiKeys).values({
      userId,
      name: 'Active key',
      keyHash: `hash-active-${crypto.randomUUID()}`,
      keyPrefix: 'sk_live_ac',
    }).returning()
    createdIds.push(active.id)

    const [toRevoke] = await db.insert(apiKeys).values({
      userId,
      name: 'To-be-revoked key',
      keyHash: `hash-revoke-${crypto.randomUUID()}`,
      keyPrefix: 'sk_live_rv',
    }).returning()
    createdIds.push(toRevoke.id)

    // Revoke one key via the DELETE handler
    const delRes = await DELETE(
      new Request(`http://localhost/api/v1/api-keys/${toRevoke.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: toRevoke.id }) },
    )
    expect(delRes.status).toBe(200)

    // GET should return the active key but not the revoked one
    const res = await GET(new Request('http://localhost/api/v1/api-keys'))
    expect(res.status).toBe(200)
    const { apiKeys: rows } = await res.json() as { apiKeys: { id: string }[] }
    const ids = rows.map(r => r.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(toRevoke.id)

    // Verify the row is soft-deleted (revokedAt set), not hard-deleted
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, toRevoke.id))
    expect(row.revokedAt).not.toBeNull()
  })
})
