import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { investorProfiles } from '@/db/schema'

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

describe('profile API — integration', () => {
  let userId: string

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

    // Clean up any existing profile for this test user
    await db.delete(investorProfiles).where(eq(investorProfiles.userId, userId))
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (userId) await db.delete(investorProfiles).where(eq(investorProfiles.userId, userId))
  })

  it('GET: returns { profile: null } when no profile exists', async () => {
    if (!hasEnv) return
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET(new Request('http://localhost/api/profile'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ profile: null })
  })

  it('round-trip: PATCH investmentGoal, GET returns same value', async () => {
    if (!hasEnv) return
    const { PATCH, GET } = await import('@/app/api/profile/route')

    const patchRes = await PATCH(new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investmentGoal: 'Retire on passive income by 55' }),
    }))
    expect(patchRes.status).toBe(200)
    const patchBody = await patchRes.json()
    expect(patchBody.profile.investmentGoal).toBe('Retire on passive income by 55')

    const getRes = await GET(new Request('http://localhost/api/profile'))
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.profile.investmentGoal).toBe('Retire on passive income by 55')
  })

  it('RLS: a direct DB insert for another user is not visible via GET', async () => {
    if (!hasEnv) return
    const otherUserId = crypto.randomUUID()

    // Insert directly bypassing RLS to prove the WHERE clause scopes by userId
    await db.insert(investorProfiles).values({
      userId: otherUserId,
      investmentGoal: 'Other user goal',
    })

    try {
      const { GET } = await import('@/app/api/profile/route')
      const res = await GET(new Request('http://localhost/api/profile'))
      expect(res.status).toBe(200)
      const body = await res.json()
      // The authenticated user's profile should not include the other user's data
      if (body.profile !== null) {
        expect(body.profile.investmentGoal).not.toBe('Other user goal')
      }
    } finally {
      await db.delete(investorProfiles).where(eq(investorProfiles.userId, otherUserId))
    }
  })
})
