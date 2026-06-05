import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { entities, properties } from '@/db/schema'

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

describe('GET /api/properties — entityId filter (integration)', () => {
  let userId: string
  let entityAId: string
  let entityBId: string
  let propInEntityA: string
  let propInEntityB: string
  let propNoEntity: string

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

    const [entA] = await db
      .insert(entities)
      .values({ userId, name: `Entity A ${crypto.randomUUID()}`, type: 'trust' })
      .returning()
    entityAId = entA.id

    const [entB] = await db
      .insert(entities)
      .values({ userId, name: `Entity B ${crypto.randomUUID()}`, type: 'individual' })
      .returning()
    entityBId = entB.id

    const [pA] = await db
      .insert(properties)
      .values({ userId, address: `Prop A ${crypto.randomUUID()}`, startDate: '2020-01-01', entityId: entityAId })
      .returning()
    propInEntityA = pA.id

    const [pB] = await db
      .insert(properties)
      .values({ userId, address: `Prop B ${crypto.randomUUID()}`, startDate: '2020-01-01', entityId: entityBId })
      .returning()
    propInEntityB = pB.id

    const [pNone] = await db
      .insert(properties)
      .values({ userId, address: `Prop None ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propNoEntity = pNone.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (propInEntityA) await db.delete(properties).where(eq(properties.id, propInEntityA))
    if (propInEntityB) await db.delete(properties).where(eq(properties.id, propInEntityB))
    if (propNoEntity) await db.delete(properties).where(eq(properties.id, propNoEntity))
    if (entityAId) await db.delete(entities).where(eq(entities.id, entityAId))
    if (entityBId) await db.delete(entities).where(eq(entities.id, entityBId))
  })

  async function getProperties(params?: Record<string, string>) {
    const { GET } = await import('@/app/api/properties/route')
    const qs = params ? `?${new URLSearchParams(params)}` : ''
    return GET(new Request(`http://localhost/api/properties${qs}`, { method: 'GET' }))
  }

  it('no entityId: returns all test properties', async () => {
    if (!hasEnv) return
    const res = await getProperties()
    expect(res.status).toBe(200)
    const { properties: rows } = await res.json() as { properties: { id: string }[] }
    const ids = rows.map(r => r.id)
    expect(ids).toContain(propInEntityA)
    expect(ids).toContain(propInEntityB)
    expect(ids).toContain(propNoEntity)
  })

  it('entityId filter: returns only properties with matching entity_id', async () => {
    if (!hasEnv) return
    const res = await getProperties({ entityId: entityAId })
    expect(res.status).toBe(200)
    const { properties: rows } = await res.json() as { properties: { id: string }[] }
    const ids = rows.map(r => r.id)
    expect(ids).toContain(propInEntityA)
    expect(ids).not.toContain(propInEntityB)
    expect(ids).not.toContain(propNoEntity)
  })

  it('entityId with no matching properties: returns empty array', async () => {
    if (!hasEnv) return
    const emptyEntityId = crypto.randomUUID()
    const res = await getProperties({ entityId: emptyEntityId })
    expect(res.status).toBe(200)
    const { properties: rows } = await res.json() as { properties: { id: string }[] }
    expect(rows.filter(r => [propInEntityA, propInEntityB, propNoEntity].includes(r.id))).toHaveLength(0)
  })
})
