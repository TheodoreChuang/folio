import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, installmentLoans } from '@/db/schema'

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

// Test period: March 2026
const FROM = '2026-03-01'
const TO   = '2026-03-31'

describe('GET /api/ledger/summary (integration — S-1 loan date-range filter)', () => {
  let userId: string
  let propertyId: string
  let activeLoanId: string   // startDate 2020-01-01, endDate 2050-01-01 — overlaps March 2026
  let endedLoanId: string    // endDate 2025-12-31 — ended before March 2026
  let futureLoanId: string   // startDate 2026-04-01 — starts after March 2026

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
      .values({ userId, address: `Ledger Summary Integration Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [activeLoan] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId, lender: 'Active Bank', startDate: '2020-01-01', endDate: '2050-01-01' })
      .returning()
    activeLoanId = activeLoan.id

    const [endedLoan] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId, lender: 'Ended Bank', startDate: '2020-01-01', endDate: '2025-12-31' })
      .returning()
    endedLoanId = endedLoan.id

    const [futureLoan] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId, lender: 'Future Bank', startDate: '2026-04-01', endDate: '2050-01-01' })
      .returning()
    futureLoanId = futureLoan.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (activeLoanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, activeLoanId))
    if (endedLoanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, endedLoanId))
    if (futureLoanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, futureLoanId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function getLedgerSummary(from: string, to: string, propId: string) {
    const { GET } = await import('@/app/api/ledger/summary/route')
    const params = new URLSearchParams({ from, to, propertyId: propId })
    return GET(new Request(`http://localhost/api/ledger/summary?${params}`, { method: 'GET' }))
  }

  it('active loan (overlapping period) appears in missingMortgages when no payment', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummary(FROM, TO, propertyId)
    expect(res.status).toBe(200)
    const json = await res.json()
    const missing = json.flags.missingMortgages as { installmentLoanId: string }[]
    expect(missing.some((m) => m.installmentLoanId === activeLoanId)).toBe(true)
  })

  it('ended loan (endDate before period) excluded from missingMortgages (S-1)', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummary(FROM, TO, propertyId)
    expect(res.status).toBe(200)
    const json = await res.json()
    const missing = json.flags.missingMortgages as { installmentLoanId: string }[]
    expect(missing.some((m) => m.installmentLoanId === endedLoanId)).toBe(false)
  })

  it('future loan (startDate after period) excluded from missingMortgages (S-1)', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummary(FROM, TO, propertyId)
    expect(res.status).toBe(200)
    const json = await res.json()
    const missing = json.flags.missingMortgages as { installmentLoanId: string }[]
    expect(missing.some((m) => m.installmentLoanId === futureLoanId)).toBe(false)
  })
})

describe('GET /api/ledger/summary (integration — S-2 property date-range filter)', () => {
  let userId: string
  let activePropertyId: string   // startDate 2020-01-01, no endDate — overlaps March 2026
  let soldPropertyId: string     // endDate 2025-12-31 — sold before March 2026
  let futurePropertyId: string   // startDate 2026-04-01 — starts after March 2026

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

    const [activeProp] = await db
      .insert(properties)
      .values({ userId, address: `S2 Active ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    activePropertyId = activeProp.id

    const [soldProp] = await db
      .insert(properties)
      .values({ userId, address: `S2 Sold ${crypto.randomUUID()}`, startDate: '2020-01-01', endDate: '2025-12-31' })
      .returning()
    soldPropertyId = soldProp.id

    const [futureProp] = await db
      .insert(properties)
      .values({ userId, address: `S2 Future ${crypto.randomUUID()}`, startDate: '2026-04-01' })
      .returning()
    futurePropertyId = futureProp.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (activePropertyId) await db.delete(properties).where(eq(properties.id, activePropertyId))
    if (soldPropertyId) await db.delete(properties).where(eq(properties.id, soldPropertyId))
    if (futurePropertyId) await db.delete(properties).where(eq(properties.id, futurePropertyId))
  })

  async function getLedgerSummaryForUser(from: string, to: string) {
    const { GET } = await import('@/app/api/ledger/summary/route')
    const params = new URLSearchParams({ from, to })
    return GET(new Request(`http://localhost/api/ledger/summary?${params}`, { method: 'GET' }))
  }

  it('active property (overlapping period) appears in totals.properties', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummaryForUser(FROM, TO)
    expect(res.status).toBe(200)
    const json = await res.json()
    const propIds = (json.totals.properties as { propertyId: string }[]).map(p => p.propertyId)
    expect(propIds).toContain(activePropertyId)
  })

  it('sold property (endDate before period) excluded from totals.properties (S-2)', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummaryForUser(FROM, TO)
    expect(res.status).toBe(200)
    const json = await res.json()
    const propIds = (json.totals.properties as { propertyId: string }[]).map(p => p.propertyId)
    expect(propIds).not.toContain(soldPropertyId)
  })

  it('future property (startDate after period) excluded from totals.properties (S-2)', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummaryForUser(FROM, TO)
    expect(res.status).toBe(200)
    const json = await res.json()
    const propIds = (json.totals.properties as { propertyId: string }[]).map(p => p.propertyId)
    expect(propIds).not.toContain(futurePropertyId)
  })
})
