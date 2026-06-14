import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { entities, installmentLoanBalances, installmentLoans, properties } from '@/db/schema'

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

describe('GET /api/loans — filter params (integration)', () => {
  let userId: string
  let entityAId: string
  let entityBId: string
  let propId: string
  let loanEntityA: string
  let loanEntityB: string
  let loanEntityA2: string
  let loanNullEntity: string

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
      .values({ userId, name: `Loans Entity A ${crypto.randomUUID()}`, type: 'trust' })
      .returning()
    entityAId = entA.id

    const [entB] = await db
      .insert(entities)
      .values({ userId, name: `Loans Entity B ${crypto.randomUUID()}`, type: 'individual' })
      .returning()
    entityBId = entB.id

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Loans Test Prop ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propId = prop.id

    const [lA] = await db
      .insert(installmentLoans)
      .values({
        userId,
        propertyId: propId,
        entityId: entityAId,
        lender: `CBA-${crypto.randomUUID().slice(0, 8)}`,
        loanType: 'interest_only',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      })
      .returning()
    loanEntityA = lA.id

    const [lB] = await db
      .insert(installmentLoans)
      .values({
        userId,
        propertyId: propId,
        entityId: entityBId,
        lender: `Westpac-${crypto.randomUUID().slice(0, 8)}`,
        loanType: 'principal_and_interest',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      })
      .returning()
    loanEntityB = lB.id

    const [lA2] = await db
      .insert(installmentLoans)
      .values({
        userId,
        propertyId: propId,
        entityId: entityAId,
        lender: `CBA-${crypto.randomUUID().slice(0, 8)}`,
        loanType: 'line_of_credit',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      })
      .returning()
    loanEntityA2 = lA2.id

    const [lNull] = await db
      .insert(installmentLoans)
      .values({
        userId,
        propertyId: propId,
        entityId: null,
        lender: `NAB-${crypto.randomUUID().slice(0, 8)}`,
        loanType: 'interest_only',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      })
      .returning()
    loanNullEntity = lNull.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (loanEntityA) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanEntityA))
    if (loanEntityB) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanEntityB))
    if (loanEntityA2) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanEntityA2))
    if (loanNullEntity) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanNullEntity))
    if (propId) await db.delete(properties).where(eq(properties.id, propId))
    if (entityAId) await db.delete(entities).where(eq(entities.id, entityAId))
    if (entityBId) await db.delete(entities).where(eq(entities.id, entityBId))
  })

  async function getLoans(params?: Record<string, string>) {
    const { GET } = await import('@/app/api/v1/loans/route')
    const qs = params ? `?${new URLSearchParams(params)}` : ''
    return GET(new Request(`http://localhost/api/loans${qs}`, { method: 'GET' }))
  }

  it('no filters: returns all test loans', async () => {
    if (!hasEnv) return
    const res = await getLoans()
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: { id: string }[] }
    const ids = loans.map(l => l.id)
    expect(ids).toContain(loanEntityA)
    expect(ids).toContain(loanEntityB)
    expect(ids).toContain(loanEntityA2)
    expect(ids).toContain(loanNullEntity)
  })

  it('entityId filter: returns only loans with matching entity_id', async () => {
    if (!hasEnv) return
    const res = await getLoans({ entityId: entityAId })
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: { id: string }[] }
    const ids = loans.map(l => l.id)
    expect(ids).toContain(loanEntityA)
    expect(ids).not.toContain(loanEntityB)
    expect(ids).toContain(loanEntityA2)
  })

  it('entityId filter excludes loans with null entityId', async () => {
    if (!hasEnv) return
    const res = await getLoans({ entityId: entityAId })
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: { id: string }[] }
    const ids = loans.map(l => l.id)
    expect(ids).not.toContain(loanNullEntity)
  })

  it('entityId filter: unknown entity returns no matching test loans', async () => {
    if (!hasEnv) return
    const res = await getLoans({ entityId: crypto.randomUUID() })
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: { id: string }[] }
    const testIds = [loanEntityA, loanEntityB, loanEntityA2, loanNullEntity]
    expect(loans.filter(l => testIds.includes(l.id))).toHaveLength(0)
  })

  it('loanType filter: returns only loans with matching type', async () => {
    if (!hasEnv) return
    const res = await getLoans({ loanType: 'interest_only' })
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: { id: string; loanType: string }[] }
    const testLoans = loans.filter(l => [loanEntityA, loanEntityB, loanEntityA2, loanNullEntity].includes(l.id))
    expect(testLoans.map(l => l.id)).toContain(loanEntityA)
    expect(testLoans.every(l => l.loanType === 'interest_only')).toBe(true)
  })

  it('combined entityId + loanType filter: applies intersection', async () => {
    if (!hasEnv) return
    const res = await getLoans({ entityId: entityAId, loanType: 'line_of_credit' })
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: { id: string }[] }
    const ids = loans.map(l => l.id)
    expect(ids).toContain(loanEntityA2)
    expect(ids).not.toContain(loanEntityA)
    expect(ids).not.toContain(loanEntityB)
  })
})

describe('GET /api/v1/loans — FlatInstallmentLoan schema (integration)', () => {
  let userId: string
  let propId: string
  let loanWithRateId: string
  let loanWithBalanceId: string

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
      .values({ userId, address: `Schema Test Prop ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propId = prop.id

    // Loan with interestRate set — exercises numeric-as-string Drizzle type assumption
    const [lWithRate] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId: propId, lender: `RateBank-${crypto.randomUUID().slice(0, 8)}`, interestRate: '5.75', rateType: 'variable' })
      .returning()
    loanWithRateId = lWithRate.id

    // Loan with a balance row — exercises latestBalance.recordedAt date-as-string assumption
    const [lWithBal] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId: propId, lender: `BalBank-${crypto.randomUUID().slice(0, 8)}` })
      .returning()
    loanWithBalanceId = lWithBal.id

    await db
      .insert(installmentLoanBalances)
      .values({ userId, installmentLoanId: loanWithBalanceId, recordedAt: '2026-01-01', balanceCents: 50_000_000 })
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (loanWithRateId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanWithRateId))
    if (loanWithBalanceId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanWithBalanceId))
    if (propId) await db.delete(properties).where(eq(properties.id, propId))
  })

  async function getLoans(params?: Record<string, string>) {
    const { GET } = await import('@/app/api/v1/loans/route')
    const qs = params ? `?${new URLSearchParams(params)}` : ''
    return GET(new Request(`http://localhost/api/loans${qs}`, { method: 'GET' }))
  }

  it('returns 200 with non-null interestRate: Drizzle numeric comes back as string', async () => {
    if (!hasEnv) return
    const res = await getLoans()
    expect(res.status).toBe(200)
    const { loans } = await res.json() as { loans: Array<{ id: string; interestRate: unknown }> }
    const loan = loans.find(l => l.id === loanWithRateId)
    expect(loan).toBeDefined()
    expect(typeof loan!.interestRate).toBe('string')
    expect(loan!.interestRate).toBe('5.75')
  })

  it('returns 200 with non-null latestBalance: Drizzle date column comes back as string', async () => {
    if (!hasEnv) return
    const res = await getLoans()
    expect(res.status).toBe(200)
    const { loans } = await res.json() as {
      loans: Array<{ id: string; latestBalance: { recordedAt: unknown; balanceCents: unknown } | null }>
    }
    const loan = loans.find(l => l.id === loanWithBalanceId)
    expect(loan).toBeDefined()
    expect(loan!.latestBalance).not.toBeNull()
    expect(typeof loan!.latestBalance!.recordedAt).toBe('string')
    expect(loan!.latestBalance!.balanceCents).toBe(50_000_000)
  })
})
