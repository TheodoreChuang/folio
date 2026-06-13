import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personalBudgetItems } from '@/db/schema'

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
const insertedIds: string[] = []

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
  if (!hasEnv) return
  if (insertedIds.length > 0) {
    await db.delete(personalBudgetItems).where(
      and(eq(personalBudgetItems.userId, userId))
    )
    insertedIds.length = 0
  }
})

describe('GET /api/household/items — soft-delete filter', () => {
  it('excludes soft-deleted items from GET response', async () => {
    if (!hasEnv) return

    const { GET } = await import('@/app/api/v1/household/items/route')

    const [active] = await db.insert(personalBudgetItems).values({
      userId,
      type: 'income',
      name: 'Active Salary',
      amountCents: 500000,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()
    insertedIds.push(active.id)

    const [deleted] = await db.insert(personalBudgetItems).values({
      userId,
      type: 'income',
      name: 'Deleted Item',
      amountCents: 200000,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()
    insertedIds.push(deleted.id)

    await db.update(personalBudgetItems)
      .set({ deletedAt: new Date() })
      .where(eq(personalBudgetItems.id, deleted.id))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { items: { id: string }[], summary: { totalIncomeMonthlyCents: number } }

    const ids = body.items.map((i) => i.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(deleted.id)
  })

  it('summary totals exclude soft-deleted items', async () => {
    if (!hasEnv) return

    const { GET } = await import('@/app/api/v1/household/items/route')

    const [active] = await db.insert(personalBudgetItems).values({
      userId,
      type: 'income',
      name: 'Active Income',
      amountCents: 100000,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()
    insertedIds.push(active.id)

    const [deleted] = await db.insert(personalBudgetItems).values({
      userId,
      type: 'income',
      name: 'Deleted Income',
      amountCents: 999999,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()
    insertedIds.push(deleted.id)

    await db.update(personalBudgetItems)
      .set({ deletedAt: new Date() })
      .where(eq(personalBudgetItems.id, deleted.id))

    const res = await GET()
    const body = await res.json() as { summary: { totalIncomeMonthlyCents: number } }

    expect(body.summary.totalIncomeMonthlyCents).toBe(100000)
  })
})

describe('PATCH /api/household/items/[id] — soft-delete filter', () => {
  it('returns 404 when patching a soft-deleted item', async () => {
    if (!hasEnv) return

    const { PATCH } = await import('@/app/api/v1/household/items/[id]/route')

    const [item] = await db.insert(personalBudgetItems).values({
      userId,
      type: 'expense',
      name: 'To Be Deleted',
      amountCents: 50000,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()
    insertedIds.push(item.id)

    await db.update(personalBudgetItems)
      .set({ deletedAt: new Date() })
      .where(eq(personalBudgetItems.id, item.id))

    const req = new Request(`http://localhost/api/household/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: item.id }) })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/household/items/[id] — soft-delete filter', () => {
  it('returns 404 when deleting an already soft-deleted item', async () => {
    if (!hasEnv) return

    const { DELETE } = await import('@/app/api/v1/household/items/[id]/route')

    const [item] = await db.insert(personalBudgetItems).values({
      userId,
      type: 'expense',
      name: 'Already Deleted',
      amountCents: 30000,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()
    insertedIds.push(item.id)

    await db.update(personalBudgetItems)
      .set({ deletedAt: new Date() })
      .where(eq(personalBudgetItems.id, item.id))

    const req = new Request(`http://localhost/api/household/items/${item.id}`, {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ id: item.id }) })
    expect(res.status).toBe(404)
  })
})

describe('Auth isolation', () => {
  it('items from another user do not appear in GET response', async () => {
    if (!hasEnv) return

    const { GET } = await import('@/app/api/v1/household/items/route')

    const otherUserId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'

    const [otherItem] = await db.insert(personalBudgetItems).values({
      userId: otherUserId,
      type: 'income',
      name: 'Other User Income',
      amountCents: 999999,
      frequency: 'monthly',
      effectiveFrom: '2024-01-01',
    }).returning()

    const res = await GET()
    const body = await res.json() as { items: { id: string }[] }
    const ids = body.items.map((i) => i.id)
    expect(ids).not.toContain(otherItem.id)

    await db.delete(personalBudgetItems).where(eq(personalBudgetItems.id, otherItem.id))
  })
})
