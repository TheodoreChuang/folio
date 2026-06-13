import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoans, loanLedger, properties } from '@/db/schema'

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

describe('GET /api/loans/[id]/repayments (integration — soft-delete filter)', () => {
  let userId: string
  let propertyId: string
  let loanId: string
  let entryId: string

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
      .values({ userId, address: `Loan Repayments Integration ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [loan] = await db
      .insert(installmentLoans)
      .values({
        userId,
        propertyId,
        lender: 'Test Lender Integration',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      })
      .returning()
    loanId = loan.id

    const [entry] = await db
      .insert(loanLedger)
      .values({
        userId,
        installmentLoanId: loanId,
        paymentDate: '2026-04-01',
        amountCents: 216700,
        interestCents: 150000,
        principalCents: 66700,
      })
      .returning()
    entryId = entry.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (entryId) await db.delete(loanLedger).where(eq(loanLedger.id, entryId))
    if (loanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function getRepayments(id: string) {
    const { GET } = await import('@/app/api/v1/loans/[id]/repayments/route')
    return GET(
      new Request(`http://localhost/api/loans/${id}/repayments`, { method: 'GET' }),
      { params: Promise.resolve({ id }) }
    )
  }

  it('GET returns the entry when not soft-deleted', async () => {
    if (!hasEnv) return
    const res = await getRepayments(loanId)
    expect(res.status).toBe(200)
    const json = await res.json() as { repayments: { id: string }[] }
    expect(json.repayments.some(r => r.id === entryId)).toBe(true)
  })

  it('GET excludes soft-deleted entries (isNull deletedAt filter)', async () => {
    if (!hasEnv) return
    await db.update(loanLedger).set({ deletedAt: new Date() }).where(eq(loanLedger.id, entryId))
    try {
      const res = await getRepayments(loanId)
      expect(res.status).toBe(200)
      const json = await res.json() as { repayments: { id: string }[] }
      expect(json.repayments.some(r => r.id === entryId)).toBe(false)
    } finally {
      await db.update(loanLedger).set({ deletedAt: null }).where(eq(loanLedger.id, entryId))
    }
  })
})

describe('POST /api/loans/[id]/repayments (integration — insert and retrieve)', () => {
  let userId: string
  let propertyId: string
  let loanId: string
  const createdEntryIds: string[] = []

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
      .values({ userId, address: `Loan Repayments POST Integration ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [loan] = await db
      .insert(installmentLoans)
      .values({
        userId,
        propertyId,
        lender: 'Test Lender POST Integration',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      })
      .returning()
    loanId = loan.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    for (const id of createdEntryIds) {
      await db.delete(loanLedger).where(eq(loanLedger.id, id))
    }
    if (loanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  it('POST inserts a row; subsequent GET returns it with correct field values', async () => {
    if (!hasEnv) return

    const { POST, GET } = await import('@/app/api/v1/loans/[id]/repayments/route')
    const postRes = await POST(
      new Request(`http://localhost/api/loans/${loanId}/repayments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate: '2026-05-01',
          amountCents: 300000,
          interestCents: 200000,
          principalCents: 100000,
        }),
      }),
      { params: Promise.resolve({ id: loanId }) }
    )
    expect(postRes.status).toBe(201)
    const postJson = await postRes.json() as { repayment: { id: string; amountCents: number } }
    expect(postJson.repayment.amountCents).toBe(300000)
    createdEntryIds.push(postJson.repayment.id)

    const getRes = await GET(
      new Request(`http://localhost/api/loans/${loanId}/repayments`, { method: 'GET' }),
      { params: Promise.resolve({ id: loanId }) }
    )
    expect(getRes.status).toBe(200)
    const getJson = await getRes.json() as { repayments: { id: string; amountCents: number }[] }
    const created = getJson.repayments.find(r => r.id === postJson.repayment.id)
    expect(created).toBeDefined()
    expect(created!.amountCents).toBe(300000)
  })
})
