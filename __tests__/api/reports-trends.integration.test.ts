import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

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

describe('GET /api/v1/reports/trends (integration)', () => {
  beforeAll(async () => {
    if (!hasEnv) return

    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)

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

  async function getTrends(params: Record<string, string>) {
    const { GET } = await import('@/app/api/v1/reports/trends/route')
    return GET(new Request(`http://localhost/api/v1/reports/trends?${new URLSearchParams(params)}`))
  }

  it('returns 200 with one trend point per month in the requested range', async () => {
    if (!hasEnv) return
    const res = await getTrends({ from: '2026-01-01', to: '2026-03-31' })
    expect(res.status).toBe(200)
    const { trends } = await res.json() as {
      trends: Array<{
        month: string
        rentCents: number
        expensesCents: number
        mortgageCents: number
        netCents: number
        hasData: boolean
      }>
    }
    expect(Array.isArray(trends)).toBe(true)
    expect(trends).toHaveLength(3)
    expect(trends.map(t => t.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    for (const point of trends) {
      expect(typeof point.rentCents).toBe('number')
      expect(typeof point.expensesCents).toBe('number')
      expect(typeof point.mortgageCents).toBe('number')
      expect(typeof point.netCents).toBe('number')
      expect(typeof point.hasData).toBe('boolean')
    }
  })
})
