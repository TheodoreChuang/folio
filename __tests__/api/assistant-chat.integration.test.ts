import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assistantUsage } from '@/db/schema'

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

const today = new Date().toISOString().slice(0, 10)

const VALID_BODY = {
  messages: [
    {
      id: 'msg-1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Hello' }],
      metadata: undefined,
    },
  ],
}

function makeRequest() {
  return new Request('http://localhost/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(VALID_BODY),
  })
}

describe('POST /api/assistant/chat — integration', () => {
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

    // Clean up any leftover usage rows for today
    await db.delete(assistantUsage).where(
      and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
    )
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (userId) {
      await db.delete(assistantUsage).where(
        and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today))
      )
    }
  })

  it('returns 429 with cap-reached body when daily limit is already consumed', async () => {
    if (!hasEnv) return

    // Pre-seed the usage row at the cap (25) — consumeIfAllowed will reject without calling the model
    await db.insert(assistantUsage).values({
      userId,
      usageDate: today,
      messageCount: 25,
    })

    const { POST } = await import('@/app/api/assistant/chat/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(429)
    const body = await res.json() as { error: string; used: number; limit: number }
    expect(body.error).toBe('Daily message limit reached')
    expect(body.used).toBe(26) // sentinel value after atomic increment attempt
    expect(body.limit).toBe(25)
  })
})
