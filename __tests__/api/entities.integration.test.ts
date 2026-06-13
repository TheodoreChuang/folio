import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { entities } from '@/db/schema'

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

describe('entities API — user isolation (integration)', () => {
  let userId: string
  let ownEntityId: string
  let otherEntityId: string
  const OTHER_USER_ID = crypto.randomUUID()

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

    const [own] = await db
      .insert(entities)
      .values({ userId, name: `Own entity ${crypto.randomUUID()}`, type: 'individual' })
      .returning()
    ownEntityId = own.id

    // Direct insert for a phantom user (bypasses RLS — proves app-layer WHERE clause)
    const [other] = await db
      .insert(entities)
      .values({ userId: OTHER_USER_ID, name: `Other user entity ${crypto.randomUUID()}`, type: 'trust' })
      .returning()
    otherEntityId = other.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (ownEntityId) await db.delete(entities).where(eq(entities.id, ownEntityId))
    if (otherEntityId) await db.delete(entities).where(eq(entities.id, otherEntityId))
  })

  it('GET: returns own entities, excludes other user entities', async () => {
    if (!hasEnv) return
    const { GET } = await import('@/app/api/v1/entities/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const { entities: rows } = await res.json() as { entities: { id: string }[] }
    const ids = rows.map(r => r.id)
    expect(ids).toContain(ownEntityId)
    expect(ids).not.toContain(otherEntityId)
  })

  it('PATCH: returns 404 when trying to update another user\'s entity', async () => {
    if (!hasEnv) return
    const { PATCH } = await import('@/app/api/v1/entities/[id]/route')
    const res = await PATCH(
      new Request(`http://localhost/api/entities/${otherEntityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hijacked' }),
      }),
      { params: Promise.resolve({ id: otherEntityId }) }
    )
    expect(res.status).toBe(404)
    // Verify the other user's entity was not modified
    const [row] = await db.select().from(entities).where(eq(entities.id, otherEntityId))
    expect(row.name).not.toBe('Hijacked')
  })

  it('DELETE: returns 404 when trying to delete another user\'s entity', async () => {
    if (!hasEnv) return
    const { DELETE } = await import('@/app/api/v1/entities/[id]/route')
    const res = await DELETE(
      new Request(`http://localhost/api/entities/${otherEntityId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: otherEntityId }) }
    )
    expect(res.status).toBe(404)
    // Verify the other user's entity still exists
    const [row] = await db.select().from(entities).where(eq(entities.id, otherEntityId))
    expect(row).toBeDefined()
  })
})
