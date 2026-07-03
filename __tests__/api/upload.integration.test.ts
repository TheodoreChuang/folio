import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sourceDocuments } from '@/db/schema'

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

const fixturePath = join(
  process.cwd(),
  '__tests__/fixtures/sample-statement.pdf'
)

describe('POST /api/upload (integration)', () => {
  let userId: string
  /** Unique filename per run so Storage upload doesn't hit "resource already exists" from a previous run */
  const uniqueFileName = `sample-statement-${crypto.randomUUID()}.pdf`
  /** Unique content per run so duplicate check doesn't find a row from a previous run */
  let uniqueBuffer: Buffer
  /** Set after first successful upload so the storage-access test can download it */
  let uploadedFilePath: string | undefined
  /** Set after first successful upload so we can delete the row in afterAll */
  let uploadedDocId: string | undefined

  beforeAll(async () => {
    if (!hasEnv) return
    try {
      const fixture = readFileSync(fixturePath)
      uniqueBuffer = Buffer.concat([fixture, Buffer.from(crypto.randomUUID())])
    } catch {
      uniqueBuffer = Buffer.from(crypto.randomUUID())
    }
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
    userId = session.user.id
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
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (uploadedFilePath) {
      const serverClient = createServerClient(url!, anonKey!, {
        cookies: {
          getAll: () => refs.cookieStore,
          setAll: () => {},
        },
      })
      await serverClient.storage.from('documents').remove([uploadedFilePath])
    }
    if (uploadedDocId) {
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, uploadedDocId))
    }
  })

  async function uploadRequest(
    fileBuffer: Buffer,
    fileName: string,
    documentType: string,
  ) {
    const { POST } = await import('@/app/api/v1/upload/route')
    const form = new FormData()
    const file = new File([new Uint8Array(fileBuffer)], fileName, { type: 'application/pdf' })
    form.append('file', file)
    form.append('documentType', documentType)
    return POST(
      new Request('http://localhost/api/upload', { method: 'POST', body: form })
    )
  }

  it('uploads a real PDF and creates a source_documents row', async () => {
    if (!hasEnv || !uniqueBuffer) return
    const res = await uploadRequest(
      uniqueBuffer,
      uniqueFileName,
      'pm_statement',
    )
    const json = await res.json()
    if (res.status !== 200) {
      console.error('Upload failed:', res.status, json)
    }
    expect(res.status, JSON.stringify(json)).toBe(201)
    expect(json.isDuplicate).toBe(false)
    expect(json.sourceDocumentId).toBeDefined()
    expect(json.filePath).toMatch(
      new RegExp(`^documents/${userId}/pm_statements/.*\\.pdf$`)
    )
    uploadedFilePath = json.filePath
    uploadedDocId = json.sourceDocumentId
    const rows = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.userId, userId))
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const inserted = rows.find((r) => r.id === json.sourceDocumentId)
    expect(inserted).toBeDefined()
    expect(inserted!.filePath).toBe(json.filePath)
  })

  it('second upload of the same active file returns 409 identifying the existing upload', async () => {
    if (!hasEnv || !uniqueBuffer || !uploadedDocId) return
    const res = await uploadRequest(
      uniqueBuffer,
      uniqueFileName,
      'pm_statement',
    )
    const json = await res.json()
    expect(res.status, JSON.stringify(json)).toBe(409)
    expect(json.existingUploadId).toBe(uploadedDocId)
  })

  it('re-upload after voiding the prior upload succeeds with a new pending row (R14)', async () => {
    if (!hasEnv || !uniqueBuffer || !uploadedDocId) return
    // Simulate a void: soft-delete the prior row (the partial unique index excludes it).
    await db.update(sourceDocuments)
      .set({ deletedAt: new Date(), status: 'voided' })
      .where(eq(sourceDocuments.id, uploadedDocId))

    const res = await uploadRequest(uniqueBuffer, uniqueFileName, 'pm_statement')
    const json = await res.json()
    expect(res.status, JSON.stringify(json)).toBe(201)
    expect(json.isDuplicate).toBe(false)
    expect(json.sourceDocumentId).not.toBe(uploadedDocId)

    // The re-upload's storage write reused the deterministic path via the upsert retry.
    const [reuploaded] = await db.select().from(sourceDocuments)
      .where(eq(sourceDocuments.id, json.sourceDocumentId))
    expect(reuploaded.status).toBe('pending')

    // Clean up the new row + object (afterAll only tracks the first upload).
    uploadedFilePath = json.filePath
    await db.delete(sourceDocuments).where(eq(sourceDocuments.id, json.sourceDocumentId))
  })

  it('uploaded file is accessible in Storage under correct path', async () => {
    if (!hasEnv || !uploadedFilePath || !uniqueBuffer) return
    const serverClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => refs.cookieStore,
          setAll: () => {},
        },
      }
    )
    const { data, error } = await serverClient.storage
      .from('documents')
      .download(uploadedFilePath)
    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data!.size).toBe(uniqueBuffer.length)
  })

  it('two different-content files sharing a name get distinct paths — the first is not overwritten (blocker regression)', async () => {
    if (!hasEnv) return
    // Pre-fix, storage paths were keyed by filename: uploading a second, different-content
    // file with the same name collided on path, and the 409-retry branch deleted the first
    // file's object and overwrote it. Hash-keyed paths make the two uploads independent.
    const sharedName = `collision-${crypto.randomUUID()}.pdf`
    const bufferA = Buffer.concat([Buffer.from('content-A'), Buffer.from(crypto.randomUUID())])
    const bufferB = Buffer.concat([Buffer.from('content-B-longer'), Buffer.from(crypto.randomUUID())])

    const resA = await uploadRequest(bufferA, sharedName, 'pm_statement')
    const jsonA = await resA.json()
    expect(resA.status, JSON.stringify(jsonA)).toBe(201)
    const resB = await uploadRequest(bufferB, sharedName, 'pm_statement')
    const jsonB = await resB.json()
    expect(resB.status, JSON.stringify(jsonB)).toBe(201)

    const serverClient = createServerClient(url!, anonKey!, {
      cookies: { getAll: () => refs.cookieStore, setAll: () => {} },
    })
    try {
      // Distinct content → distinct hash-keyed paths → no collision, no overwrite.
      expect(jsonB.sourceDocumentId).not.toBe(jsonA.sourceDocumentId)
      expect(jsonB.filePath).not.toBe(jsonA.filePath)

      // File A's stored object must still hold content A (pre-fix, B's upload destroyed it).
      const { data, error } = await serverClient.storage.from('documents').download(jsonA.filePath)
      expect(error).toBeNull()
      expect(data!.size).toBe(bufferA.length)
    } finally {
      await serverClient.storage.from('documents').remove([jsonA.filePath, jsonB.filePath])
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, jsonA.sourceDocumentId))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, jsonB.sourceDocumentId))
    }
  })

  it('RLS: user B cannot see user A\'s source_documents row', async () => {
    if (!hasEnv) return
    const userBEmail = process.env.TEST_USER_B_EMAIL
    const userBPassword = process.env.TEST_USER_B_PASSWORD
    if (!userBEmail || !userBPassword) return
    const anon = createClient(url!, anonKey!)
    const {
      data: { session: sessionB },
      error: signInErrorB,
    } = await anon.auth.signInWithPassword({
      email: userBEmail,
      password: userBPassword,
    })
    if (signInErrorB || !sessionB) return
    const clientB = createServerClient(url!, anonKey!, {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    })
    await clientB.auth.setSession({
      access_token: sessionB.access_token,
      refresh_token: sessionB.refresh_token,
    })
    const { data: rows } = await clientB.from('source_documents').select('id')
    const _userARows = rows?.filter((_r: { id: string }) => {
      return false
    }) ?? []
    expect(rows).toBeDefined()
    expect(rows!.every((r: { id: string }) => r.id !== undefined)).toBe(true)
    const userIdB = sessionB.user.id
    const rowsForB = rows!.filter(
      (_: unknown, i: number) => (rows as { user_id?: string }[])[i]?.user_id === userIdB
    )
    const rowsFromA = rows!.length - rowsForB.length
    expect(rowsFromA).toBe(0)
  })
})
