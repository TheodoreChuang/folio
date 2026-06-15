import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assistantUsage } from '@/db/schema'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

let userId: string
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

  // Clean up any leftover rows from previous test runs
  await db.delete(assistantUsage).where(
    and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
  )
  await db.delete(assistantUsage).where(
    and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, yesterday))
  )
  await db.delete(assistantUsage).where(eq(assistantUsage.userId, OTHER_USER_ID))
})

afterAll(async () => {
  if (!hasEnv) return
  await db.delete(assistantUsage).where(
    and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
  )
  await db.delete(assistantUsage).where(
    and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, yesterday))
  )
  await db.delete(assistantUsage).where(eq(assistantUsage.userId, OTHER_USER_ID))
})

describe('consumeIfAllowed — concurrency boundary (integration)', () => {
  it('at used=24: exactly 1 of N parallel calls admitted; counter never exceeds 26', async () => {
    if (!hasEnv) return

    const { consumeIfAllowed } = await import('@/lib/assistant')

    // Pre-seed row at count=24
    await db.insert(assistantUsage).values({
      userId,
      usageDate: today,
      messageCount: 24,
    })

    // Fire 5 parallel calls — only one should be admitted (24→25)
    const results = await Promise.all([
      consumeIfAllowed(userId),
      consumeIfAllowed(userId),
      consumeIfAllowed(userId),
      consumeIfAllowed(userId),
      consumeIfAllowed(userId),
    ])

    const admitted = results.filter(r => r.admitted)
    const rejected = results.filter(r => !r.admitted)

    expect(admitted).toHaveLength(1)
    expect(rejected).toHaveLength(4)

    // Counter must never exceed 26 (the sentinel)
    const [row] = await db
      .select({ messageCount: assistantUsage.messageCount })
      .from(assistantUsage)
      .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today)))
    expect(row.messageCount).toBeLessThanOrEqual(26)

    // Clean up for next test
    await db.delete(assistantUsage).where(
      and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
    )
  })
})

describe('consumeIfAllowed — UTC day reset (integration)', () => {
  it('yesterday row at count=25 does not affect today — today returns admitted:true, used:1', async () => {
    if (!hasEnv) return

    const { consumeIfAllowed } = await import('@/lib/assistant')

    // Insert yesterday's fully-consumed row
    await db.insert(assistantUsage).values({
      userId,
      usageDate: yesterday,
      messageCount: 25,
    })

    // Today's call should start fresh
    const result = await consumeIfAllowed(userId)
    expect(result).toEqual({ admitted: true, used: 1 })

    // Clean up
    await db.delete(assistantUsage).where(
      and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
    )
  })
})

describe('consumeIfAllowed — cross-user isolation (integration)', () => {
  it("user B's consumption does not affect user A's count", async () => {
    if (!hasEnv) return

    const { consumeIfAllowed } = await import('@/lib/assistant')

    // User A starts fresh today
    const resultA1 = await consumeIfAllowed(userId)
    expect(resultA1).toEqual({ admitted: true, used: 1 })

    // User B consumes several times
    await consumeIfAllowed(OTHER_USER_ID)
    await consumeIfAllowed(OTHER_USER_ID)
    await consumeIfAllowed(OTHER_USER_ID)

    // User A's second call should be 2, unaffected by B
    const resultA2 = await consumeIfAllowed(userId)
    expect(resultA2).toEqual({ admitted: true, used: 2 })

    // Clean up
    await db.delete(assistantUsage).where(
      and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
    )
    await db.delete(assistantUsage).where(eq(assistantUsage.userId, OTHER_USER_ID))
  })
})
