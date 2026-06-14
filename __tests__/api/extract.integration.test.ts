import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

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
const hasEnv =
  !!url &&
  !!anonKey &&
  !!testEmail &&
  !!testPassword &&
  !!process.env.DATABASE_URL
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

const fixturePath = join(
  process.cwd(),
  '__tests__/fixtures/sample-statement.pdf'
)

describe('POST /api/extract (integration)', () => {
  let sourceDocumentId: string | undefined

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const {
      data: { session },
      error: signInError,
    } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (signInError || !session) {
      throw new Error(
        `Test user sign-in failed: ${signInError?.message ?? 'no session'}`
      )
    }
    const serverClient = createServerClient(url!, anonKey!, {
      cookies: {
        getAll: () => refs.cookieStore,
        setAll: (cookies) => {
          refs.cookieStore.length = 0
          refs.cookieStore.push(...cookies)
        },
      },
    })
    await serverClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })

    let buffer: Buffer
    try {
      buffer = readFileSync(fixturePath)
    } catch {
      return
    }
    const { POST: uploadPost } = await import('@/app/api/v1/upload/route')
    const form = new FormData()
    const file = new File([new Uint8Array(buffer)], 'extract-fixture.pdf', {
      type: 'application/pdf',
    })
    form.append('file', file)
    form.append('documentType', 'pm_statement')
    form.append('assignedMonth', '2026-03')
    const uploadRes = await uploadPost(
      new Request('http://localhost/api/upload', { method: 'POST', body: form })
    )
    if (uploadRes.status !== 200) return
    const uploadJson = await uploadRes.json()
    sourceDocumentId = uploadJson.sourceDocumentId
  })

  async function extractRequest(
    sourceDocumentId: string,
    assignedMonth: string
  ) {
    const { POST } = await import('@/app/api/v1/extract/route')
    return POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId, assignedMonth }),
      })
    )
  }

  it('full flow: upload fixture PDF → extract → returns sourceDocumentId and stagedCount', async () => {
    if (!hasEnv || !sourceDocumentId) return
    if (!hasAnthropicKey) return
    const res = await extractRequest(sourceDocumentId, '2026-03')
    if (res.status === 422) return
    if (res.status !== 200) {
      const body = await res.json().catch(() => ({}))
      console.error('Extract failed:', res.status, body)
      expect(res.status).toBe(200)
      return
    }
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(sourceDocumentId)
    expect(typeof json.stagedCount).toBe('number')
    expect(json.stagedCount).toBeGreaterThanOrEqual(0)
    expect(json.result).toBeUndefined()
  })
})
