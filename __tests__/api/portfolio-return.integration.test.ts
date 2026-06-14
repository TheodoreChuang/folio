import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, propertyLedger, propertyValuations } from '@/db/schema'

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

describe('GET /api/v1/portfolio/return (integration)', () => {
  let userId: string
  let propId: string
  let valuationId: string
  let ledgerEntryId: string

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

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Return Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propId = prop.id

    // Valuation so currentValueCents > 0 and grossYieldPct is non-null
    const [val] = await db
      .insert(propertyValuations)
      .values({ userId, propertyId: propId, valuedAt: '2026-03-01', valueCents: 70_000_000 })
      .returning()
    valuationId = val.id

    // Rent entry so annualisedRentCents > 0
    const [entry] = await db
      .insert(propertyLedger)
      .values({ userId, propertyId: propId, lineItemDate: '2026-01-15', amountCents: 220_000, category: 'rent' })
      .returning()
    ledgerEntryId = entry.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (ledgerEntryId) await db.delete(propertyLedger).where(eq(propertyLedger.id, ledgerEntryId))
    if (valuationId) await db.delete(propertyValuations).where(eq(propertyValuations.id, valuationId))
    if (propId) await db.delete(properties).where(eq(properties.id, propId))
  })

  async function getReturn(params: Record<string, string>) {
    const { GET } = await import('@/app/api/v1/portfolio/return/route')
    return GET(new Request(`http://localhost/api/v1/portfolio/return?${new URLSearchParams(params)}`))
  }

  it('returns 200 with non-null metrics when valuation and rent data exist', async () => {
    if (!hasEnv) return
    const res = await getReturn({ from: '2026-01-01', to: '2026-03-31' })
    expect(res.status).toBe(200)
    const { return: ret } = await res.json() as {
      return: {
        grossYieldPct: number | null
        capitalGrowthPct: number | null
        capitalGrowthCents: number | null
        totalReturnPct: number | null
        annualisedRentCents: number
        currentValueCents: number
      }
    }
    expect(ret.currentValueCents).toBe(70_000_000)
    expect(ret.annualisedRentCents).toBeGreaterThan(0)
    expect(typeof ret.grossYieldPct).toBe('number')
  })
})
