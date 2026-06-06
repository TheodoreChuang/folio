import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { entities, properties, propertyLedger } from '@/db/schema'
import { fetchTrendData } from '@/lib/aggregate'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

describe('fetchTrendData — entityId filter (integration)', () => {
  let userId: string
  let entityAId: string
  let entityBId: string
  let propInEntityA: string
  let propInEntityB: string

  beforeAll(async () => {
    if (!hasEnv) return

    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id

    const [entA] = await db
      .insert(entities)
      .values({ userId, name: `Trends Entity A ${crypto.randomUUID()}`, type: 'trust' })
      .returning()
    entityAId = entA.id

    const [entB] = await db
      .insert(entities)
      .values({ userId, name: `Trends Entity B ${crypto.randomUUID()}`, type: 'individual' })
      .returning()
    entityBId = entB.id

    const [pA] = await db
      .insert(properties)
      .values({ userId, address: `Trends Prop A ${crypto.randomUUID()}`, startDate: '2020-01-01', entityId: entityAId })
      .returning()
    propInEntityA = pA.id

    const [pB] = await db
      .insert(properties)
      .values({ userId, address: `Trends Prop B ${crypto.randomUUID()}`, startDate: '2020-01-01', entityId: entityBId })
      .returning()
    propInEntityB = pB.id

    // Insert ledger entries for both properties in the same month
    await db.insert(propertyLedger).values([
      {
        userId,
        propertyId: propInEntityA,
        lineItemDate: '2026-03-15',
        category: 'rent',
        amountCents: 200000,
        description: 'Trends test rent A',
      },
      {
        userId,
        propertyId: propInEntityB,
        lineItemDate: '2026-03-15',
        category: 'rent',
        amountCents: 300000,
        description: 'Trends test rent B',
      },
    ])
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (propInEntityA) {
      await db.delete(propertyLedger).where(eq(propertyLedger.propertyId, propInEntityA))
      await db.delete(properties).where(eq(properties.id, propInEntityA))
    }
    if (propInEntityB) {
      await db.delete(propertyLedger).where(eq(propertyLedger.propertyId, propInEntityB))
      await db.delete(properties).where(eq(properties.id, propInEntityB))
    }
    if (entityAId) await db.delete(entities).where(eq(entities.id, entityAId))
    if (entityBId) await db.delete(entities).where(eq(entities.id, entityBId))
  })

  it('no entityId: returns trend rows for both entities', async () => {
    if (!hasEnv) return
    const rows = await fetchTrendData(userId, '2026-03-01', '2026-03-31')
    const march = rows.filter(r => r.month === '2026-03' && r.category === 'rent')
    const total = march.reduce((s, r) => s + Number(r.totalCents), 0)
    expect(total).toBeGreaterThanOrEqual(500000)
  })

  it('entityId for A: returns only rows for properties in entity A', async () => {
    if (!hasEnv) return
    const rows = await fetchTrendData(userId, '2026-03-01', '2026-03-31', entityAId)
    const march = rows.find(r => r.month === '2026-03' && r.category === 'rent')
    expect(march).toBeDefined()
    expect(Number(march!.totalCents)).toBe(200000)
  })

  it('entityId for B: returns only rows for properties in entity B', async () => {
    if (!hasEnv) return
    const rows = await fetchTrendData(userId, '2026-03-01', '2026-03-31', entityBId)
    const march = rows.find(r => r.month === '2026-03' && r.category === 'rent')
    expect(march).toBeDefined()
    expect(Number(march!.totalCents)).toBe(300000)
  })

  it('entityId with no matching properties: returns empty array', async () => {
    if (!hasEnv) return
    const rows = await fetchTrendData(userId, '2026-03-01', '2026-03-31', crypto.randomUUID())
    expect(rows).toHaveLength(0)
  })
})
