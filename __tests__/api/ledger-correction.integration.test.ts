import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, propertyLedger } from '@/db/schema'
import { correctLedgerEntry, deleteLedgerEntry } from '@/lib/aggregate'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

describe('ledger correction + delete provenance (integration — U7)', () => {
  let userId: string
  let propertyId: string
  const createdIds: string[] = []

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!, password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id
    const [prop] = await db.insert(properties)
      .values({ userId, address: `Ledger Correction Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    for (const id of createdIds) {
      await db.delete(propertyLedger).where(eq(propertyLedger.id, id))
    }
    if (propertyId) await db.delete(propertyLedger).where(eq(propertyLedger.propertyId, propertyId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function insertEntry() {
    const [entry] = await db.insert(propertyLedger).values({
      userId, propertyId,
      lineItemDate: '2026-03-31', amountCents: 400000, category: 'rent', description: 'Rent',
    }).returning()
    createdIds.push(entry.id)
    return entry
  }

  it('correction soft-deletes the original (superseded) and inserts a new row with the edit', async () => {
    if (!hasEnv) return
    const original = await insertEntry()

    const corrected = await correctLedgerEntry(userId, original.id, { amountCents: 375000, category: 'other_income' })
    expect(corrected).not.toBeNull()
    createdIds.push(corrected!.id)

    // Original is soft-deleted with reason 'superseded' and absent from active queries.
    const [originalRow] = await db.select().from(propertyLedger).where(eq(propertyLedger.id, original.id))
    expect(originalRow.deletedAt).not.toBeNull()
    expect(originalRow.deletionReason).toBe('superseded')

    // New row carries the edited fields and links back to the original.
    expect(corrected!.amountCents).toBe(375000)
    expect(corrected!.category).toBe('other_income')
    expect(corrected!.supersededByEntryId).toBe(original.id)
    expect(corrected!.deletedAt).toBeNull()

    const active = await db.select().from(propertyLedger)
      .where(and(eq(propertyLedger.propertyId, propertyId), isNull(propertyLedger.deletedAt)))
    expect(active.map(r => r.id)).toContain(corrected!.id)
    expect(active.map(r => r.id)).not.toContain(original.id)
  })

  it('delete soft-deletes the entry and marks it user_deleted', async () => {
    if (!hasEnv) return
    const entry = await insertEntry()

    await deleteLedgerEntry(userId, entry.id)

    const [row] = await db.select().from(propertyLedger).where(eq(propertyLedger.id, entry.id))
    expect(row.deletedAt).not.toBeNull()
    expect(row.deletionReason).toBe('user_deleted')
  })

  it('correcting another user\'s entry returns null (cross-user isolation)', async () => {
    if (!hasEnv) return
    const entry = await insertEntry()
    const result = await correctLedgerEntry('00000000-0000-0000-0000-0000000000ff', entry.id, { amountCents: 1 })
    expect(result).toBeNull()
    // Untouched.
    const [row] = await db.select().from(propertyLedger).where(eq(propertyLedger.id, entry.id))
    expect(row.deletedAt).toBeNull()
  })
})
