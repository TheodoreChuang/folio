import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, sourceDocuments, propertyLedger, propertyStagingItems } from '@/db/schema'
import {
  softDeleteDocumentWithEntries,
  dismissPendingDocument,
  countActiveLinkedTransactions,
  listPreviouslyDeletedForReupload,
} from '@/lib/ingestion'
import { deleteLedgerEntry } from '@/lib/aggregate'

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

const TEST_MONTH = '2026-01'

describe('GET /api/documents (integration — M-1 soft-delete filter)', () => {
  let userId: string
  let propertyId: string
  let docId: string
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
      .values({ userId, address: `Docs Integration Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: `integration-test-${crypto.randomUUID()}.pdf`,
        fileHash: crypto.randomUUID(),
        documentType: 'pm_statement',
        filePath: `documents/${userId}/pm_statements/integration-test.pdf`,
      })
      .returning()
    docId = doc.id

    const [entry] = await db
      .insert(propertyLedger)
      .values({
        userId,
        propertyId,
        sourceDocumentId: docId,
        lineItemDate: '2026-01-31',
        amountCents: 200000,
        category: 'rent',
      })
      .returning()
    entryId = entry.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (entryId) await db.delete(propertyLedger).where(eq(propertyLedger.id, entryId))
    if (docId) await db.delete(sourceDocuments).where(eq(sourceDocuments.id, docId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function getDocuments(month: string) {
    const { GET } = await import('@/app/api/v1/documents/route')
    return GET(new Request(`http://localhost/api/documents?month=${month}`, { method: 'GET' }))
  }

  it('returns doc when entry and source_document are not soft-deleted', async () => {
    if (!hasEnv) return
    const res = await getDocuments(TEST_MONTH)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents.some((d: { id: string }) => d.id === docId)).toBe(true)
  })

  it('hides doc when ledger entry is soft-deleted (M-1: isNull entry.deletedAt)', async () => {
    if (!hasEnv) return
    await db.update(propertyLedger)
      .set({ deletedAt: new Date() })
      .where(eq(propertyLedger.id, entryId))
    try {
      const res = await getDocuments(TEST_MONTH)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.documents.some((d: { id: string }) => d.id === docId)).toBe(false)
    } finally {
      await db.update(propertyLedger)
        .set({ deletedAt: null })
        .where(eq(propertyLedger.id, entryId))
    }
  })

  it('hides doc when source_document is soft-deleted (M-1: isNull sourceDocuments.deletedAt)', async () => {
    if (!hasEnv) return
    await db.update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, docId))
    try {
      const res = await getDocuments(TEST_MONTH)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.documents.some((d: { id: string }) => d.id === docId)).toBe(false)
    } finally {
      await db.update(sourceDocuments)
        .set({ deletedAt: null })
        .where(eq(sourceDocuments.id, docId))
    }
  })
})

describe('source_documents partial unique hash index (integration — U1/R14)', () => {
  let userId: string
  const createdIds: string[] = []

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    for (const id of createdIds) {
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id))
    }
  })

  function docValues(hash: string, deleted: boolean) {
    return {
      userId,
      fileName: `hash-index-test-${crypto.randomUUID()}.pdf`,
      fileHash: hash,
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      deletedAt: deleted ? new Date() : null,
    }
  }

  it('allows an active row to share a hash with a soft-deleted row (re-upload after void)', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()

    const [deleted] = await db.insert(sourceDocuments).values(docValues(hash, true)).returning()
    createdIds.push(deleted.id)

    const [active] = await db.insert(sourceDocuments).values(docValues(hash, false)).returning()
    createdIds.push(active.id)

    expect(active.id).toBeTruthy()
    expect(active.status).toBe('pending')
  })

  it('rejects a second active row with the same (userId, fileHash)', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()

    const [first] = await db.insert(sourceDocuments).values(docValues(hash, false)).returning()
    createdIds.push(first.id)

    // Drizzle wraps driver errors — the Postgres code is on the cause, not the top level.
    await expect(
      db.insert(sourceDocuments).values(docValues(hash, false)).returning()
    ).rejects.toMatchObject({ cause: { code: '23505' } })
  })
})

describe('void + dismiss lifecycle (integration — U6)', () => {
  let userId: string
  let propertyId: string
  const createdDocIds: string[] = []

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id
    const [prop] = await db.insert(properties)
      .values({ userId, address: `Void Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    for (const id of createdDocIds) {
      await db.delete(propertyLedger).where(eq(propertyLedger.sourceDocumentId, id))
      await db.delete(propertyStagingItems).where(eq(propertyStagingItems.sourceDocumentId, id))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id))
    }
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function insertConfirmedDocWithEntry(hash: string) {
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `void-${crypto.randomUUID()}.pdf`,
      fileHash: hash,
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
    }).returning()
    createdDocIds.push(doc.id)
    const [entry] = await db.insert(propertyLedger).values({
      userId, propertyId, sourceDocumentId: doc.id,
      lineItemDate: '2026-02-15', amountCents: 150000, category: 'rent',
    }).returning()
    return { doc, entry }
  }

  it('void soft-deletes linked ledger with reason=voided and marks the doc voided', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()
    const { doc, entry } = await insertConfirmedDocWithEntry(hash)

    expect(await countActiveLinkedTransactions(userId, doc.id)).toBe(1)

    const { entriesDeleted } = await softDeleteDocumentWithEntries(userId, doc.id)
    expect(entriesDeleted).toBe(1)

    const [ledgerRow] = await db.select().from(propertyLedger).where(eq(propertyLedger.id, entry.id))
    expect(ledgerRow.deletedAt).not.toBeNull()
    expect(ledgerRow.deletionReason).toBe('voided')

    const [docRow] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, doc.id))
    expect(docRow.status).toBe('voided')
    expect(docRow.deletedAt).not.toBeNull()

    // No active linked transactions remain, and the hash is free for re-upload.
    expect(await countActiveLinkedTransactions(userId, doc.id)).toBe(0)
    const [reupload] = await db.insert(sourceDocuments).values({
      userId, fileName: 're.pdf', fileHash: hash, documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
    }).returning()
    createdDocIds.push(reupload.id)
    expect(reupload.status).toBe('pending')
  })

  it('dismiss clears staging, touches no ledger, and marks the doc dismissed', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `dismiss-${crypto.randomUUID()}.pdf`,
      fileHash: hash,
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'pending',
    }).returning()
    createdDocIds.push(doc.id)
    await db.insert(propertyStagingItems).values({
      userId, sourceDocumentId: doc.id, lineItemIndex: 0,
      lineItemDate: '2026-02-15', amountCents: 150000, category: 'rent',
      description: 'Rent', confidence: 'high',
    })

    await dismissPendingDocument(userId, doc.id)

    const staging = await db.select().from(propertyStagingItems)
      .where(eq(propertyStagingItems.sourceDocumentId, doc.id))
    expect(staging).toHaveLength(0)

    const [docRow] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, doc.id))
    expect(docRow.status).toBe('dismissed')
    expect(docRow.deletedAt).not.toBeNull()

    const ledger = await db.select().from(propertyLedger)
      .where(and(eq(propertyLedger.sourceDocumentId, doc.id), isNull(propertyLedger.deletedAt)))
    expect(ledger).toHaveLength(0)
  })
})

describe('R18 previously-deleted re-upload warning (integration — U8)', () => {
  let userId: string
  let propertyId: string
  const createdDocIds: string[] = []

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!, password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id
    const [prop] = await db.insert(properties)
      .values({ userId, address: `R18 Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    for (const id of createdDocIds) {
      await db.delete(propertyLedger).where(eq(propertyLedger.sourceDocumentId, id))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id))
    }
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function insertDoc(hash: string, status: 'voided' | 'dismissed' | 'pending', replaces?: string) {
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `r18-${crypto.randomUUID()}.pdf`,
      fileHash: hash,
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status,
      deletedAt: status === 'pending' ? null : new Date(),
      replacesSourceDocumentId: replaces ?? null,
    }).returning()
    createdDocIds.push(doc.id)
    return doc
  }

  async function insertDeletedLedger(
    docId: string,
    reason: 'user_deleted' | 'voided' | 'superseded',
    amountCents: number,
    description: string,
  ) {
    await db.insert(propertyLedger).values({
      userId, propertyId, sourceDocumentId: docId,
      lineItemDate: '2026-02-15', amountCents, category: 'rent', description,
      deletedAt: new Date(), deletionReason: reason,
    })
  }

  it('lists only user_deleted rows from a same-hash voided prior upload', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()
    const prior = await insertDoc(hash, 'voided')
    await insertDeletedLedger(prior.id, 'user_deleted', 5000, 'Water usage (user removed)')
    await insertDeletedLedger(prior.id, 'voided', 400000, 'Rent (removed by void)')
    await insertDeletedLedger(prior.id, 'superseded', 30000, 'Fee (corrected)')

    const current = await insertDoc(hash, 'pending')
    const result = await listPreviouslyDeletedForReupload(userId, current)

    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Water usage (user removed)')
    expect(result[0].amountCents).toBe(5000)
  })

  it('returns an empty list when there were no prior user deletions', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()
    const prior = await insertDoc(hash, 'voided')
    await insertDeletedLedger(prior.id, 'voided', 400000, 'Rent (removed by void)')
    const current = await insertDoc(hash, 'pending')

    expect(await listPreviouslyDeletedForReupload(userId, current)).toHaveLength(0)
  })

  it('resolves the prior upload via replacesSourceDocumentId across a different hash', async () => {
    if (!hasEnv) return
    const prior = await insertDoc(crypto.randomUUID(), 'voided')
    await insertDeletedLedger(prior.id, 'user_deleted', 7500, 'Late fee (user removed)')

    // Corrected file has a DIFFERENT hash — the hash fallback would miss it; the Replace
    // link resolves it.
    const current = await insertDoc(crypto.randomUUID(), 'pending', prior.id)
    const result = await listPreviouslyDeletedForReupload(userId, current)

    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Late fee (user removed)')
  })

  // AE3 lynchpin: voiding must NOT overwrite the provenance of a row the user already
  // individually deleted — the void query filters isNull(deletedAt) and must skip it, so
  // the row keeps deletionReason='user_deleted' and still surfaces in the R18 warning.
  it('void does not overwrite an already user_deleted row; it stays surfaced on re-upload', async () => {
    if (!hasEnv) return
    const hash = crypto.randomUUID()
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `ae3-${crypto.randomUUID()}.pdf`,
      fileHash: hash,
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
    }).returning()
    createdDocIds.push(doc.id)

    const [t1] = await db.insert(propertyLedger).values({
      userId, propertyId, sourceDocumentId: doc.id,
      lineItemDate: '2026-02-10', amountCents: 400000, category: 'rent', description: 'T1 rent',
    }).returning()
    const [t2] = await db.insert(propertyLedger).values({
      userId, propertyId, sourceDocumentId: doc.id,
      lineItemDate: '2026-02-20', amountCents: 6000, category: 'other_income', description: 'T2 user-removed',
    }).returning()

    // User individually deletes T2, then voids the whole statement.
    await deleteLedgerEntry(userId, t2.id)
    await softDeleteDocumentWithEntries(userId, doc.id)

    const [t2Row] = await db.select().from(propertyLedger).where(eq(propertyLedger.id, t2.id))
    expect(t2Row.deletionReason).toBe('user_deleted') // NOT overwritten to 'voided'
    const [t1Row] = await db.select().from(propertyLedger).where(eq(propertyLedger.id, t1.id))
    expect(t1Row.deletionReason).toBe('voided')

    // Re-upload of the same file surfaces only the user-deleted T2.
    const current = await insertDoc(hash, 'pending')
    const warning = await listPreviouslyDeletedForReupload(userId, current)
    expect(warning).toHaveLength(1)
    expect(warning[0].description).toBe('T2 user-removed')
  })
})

describe('GET /api/documents without month — full history (integration — U12 R24)', () => {
  let userId: string
  let propertyId: string
  const createdDocIds: string[] = []

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id
    const [prop] = await db.insert(properties)
      .values({ userId, address: `R24 Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    for (const id of createdDocIds) {
      await db.delete(propertyLedger).where(eq(propertyLedger.sourceDocumentId, id))
      await db.delete(propertyStagingItems).where(eq(propertyStagingItems.sourceDocumentId, id))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id))
    }
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function getDocumentsNoMonth(propertyIdFilter?: string) {
    const { GET } = await import('@/app/api/v1/documents/route')
    const qs = propertyIdFilter ? `?propertyId=${propertyIdFilter}` : ''
    return GET(new Request(`http://localhost/api/documents${qs}`, { method: 'GET' }))
  }

  it('returns a voided document, resolving its property via the (soft-deleted) ledger row', async () => {
    if (!hasEnv) return
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `r24-voided-${crypto.randomUUID()}.pdf`,
      fileHash: crypto.randomUUID(),
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    }).returning()
    createdDocIds.push(doc.id)
    await db.insert(propertyLedger).values({
      userId, propertyId, sourceDocumentId: doc.id,
      lineItemDate: '2026-03-15', amountCents: 100000, category: 'rent',
    })
    await softDeleteDocumentWithEntries(userId, doc.id)

    const res = await getDocumentsNoMonth()
    expect(res.status).toBe(200)
    const json = await res.json()
    const found = json.documents.find((d: { id: string }) => d.id === doc.id)
    expect(found).toBeTruthy()
    expect(found.status).toBe('voided')
    expect(found.propertyId).toBe(propertyId)
  })

  it('returns a dismissed pending document with propertyId null (staging never linked a property)', async () => {
    if (!hasEnv) return
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `r24-dismissed-${crypto.randomUUID()}.pdf`,
      fileHash: crypto.randomUUID(),
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'pending',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    }).returning()
    createdDocIds.push(doc.id)
    await dismissPendingDocument(userId, doc.id)

    const res = await getDocumentsNoMonth()
    expect(res.status).toBe(200)
    const json = await res.json()
    const found = json.documents.find((d: { id: string }) => d.id === doc.id)
    expect(found).toBeTruthy()
    expect(found.status).toBe('dismissed')
    expect(found.propertyId).toBeNull()
  })

  it('propertyId filter narrows to documents linked to that property only', async () => {
    if (!hasEnv) return
    const [otherProp] = await db.insert(properties)
      .values({ userId, address: `R24 Other ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    const [docA] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `r24-filter-a-${crypto.randomUUID()}.pdf`,
      fileHash: crypto.randomUUID(),
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
    }).returning()
    createdDocIds.push(docA.id)
    await db.insert(propertyLedger).values({
      userId, propertyId, sourceDocumentId: docA.id,
      lineItemDate: '2026-03-10', amountCents: 50000, category: 'rent',
    })
    const [docB] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `r24-filter-b-${crypto.randomUUID()}.pdf`,
      fileHash: crypto.randomUUID(),
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
    }).returning()
    createdDocIds.push(docB.id)
    await db.insert(propertyLedger).values({
      userId, propertyId: otherProp.id, sourceDocumentId: docB.id,
      lineItemDate: '2026-03-10', amountCents: 50000, category: 'rent',
    })

    try {
      const res = await getDocumentsNoMonth(propertyId)
      expect(res.status).toBe(200)
      const json = await res.json()
      const ids = json.documents.map((d: { id: string }) => d.id)
      expect(ids).toContain(docA.id)
      expect(ids).not.toContain(docB.id)
    } finally {
      await db.delete(propertyLedger).where(eq(propertyLedger.sourceDocumentId, docB.id))
      await db.delete(properties).where(eq(properties.id, otherProp.id))
    }
  })

  it('returns 400 for a malformed propertyId', async () => {
    if (!hasEnv) return
    const res = await getDocumentsNoMonth('not-a-uuid')
    expect(res.status).toBe(400)
  })

  it('dedupes multiple ledger rows for one document into a single entry, and fans out one row per property for a multi-property document', async () => {
    if (!hasEnv) return
    const [otherProp] = await db.insert(properties)
      .values({ userId, address: `R24 Fanout ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    const [doc] = await db.insert(sourceDocuments).values({
      userId,
      fileName: `r24-fanout-${crypto.randomUUID()}.pdf`,
      fileHash: crypto.randomUUID(),
      documentType: 'pm_statement',
      filePath: `documents/${userId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
    }).returning()
    createdDocIds.push(doc.id)
    // Two line items against the same property (the realistic multi-transaction case
    // selectDistinctOn exists to collapse) plus one against a second property (the
    // multi-property fan-out case).
    await db.insert(propertyLedger).values([
      { userId, propertyId, sourceDocumentId: doc.id, lineItemDate: '2026-03-05', amountCents: 10000, category: 'rent' },
      { userId, propertyId, sourceDocumentId: doc.id, lineItemDate: '2026-03-12', amountCents: 20000, category: 'rent' },
      { userId, propertyId: otherProp.id, sourceDocumentId: doc.id, lineItemDate: '2026-03-20', amountCents: 30000, category: 'rent' },
    ])

    try {
      const res = await getDocumentsNoMonth()
      expect(res.status).toBe(200)
      const json = await res.json()
      const rowsForDoc = json.documents.filter((d: { id: string }) => d.id === doc.id)
      expect(rowsForDoc).toHaveLength(2)
      const propertyIds = rowsForDoc.map((d: { propertyId: string }) => d.propertyId).sort()
      expect(propertyIds).toEqual([otherProp.id, propertyId].sort())
    } finally {
      await db.delete(propertyLedger).where(eq(propertyLedger.sourceDocumentId, doc.id))
      await db.delete(properties).where(eq(properties.id, otherProp.id))
    }
  })

  it('cross-user isolation: another user\'s document and property never appear, even when propertyId targets it directly', async () => {
    if (!hasEnv) return
    const otherUserId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
    const [otherProp] = await db.insert(properties)
      .values({ userId: otherUserId, address: `R24 Other User ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    const [otherDoc] = await db.insert(sourceDocuments).values({
      userId: otherUserId,
      fileName: `r24-other-user-${crypto.randomUUID()}.pdf`,
      fileHash: crypto.randomUUID(),
      documentType: 'pm_statement',
      filePath: `documents/${otherUserId}/pm_statements/${crypto.randomUUID()}.pdf`,
      status: 'confirmed',
    }).returning()
    await db.insert(propertyLedger).values({
      userId: otherUserId, propertyId: otherProp.id, sourceDocumentId: otherDoc.id,
      lineItemDate: '2026-03-10', amountCents: 50000, category: 'rent',
    })

    try {
      const unfiltered = await getDocumentsNoMonth()
      const unfilteredIds = (await unfiltered.json()).documents.map((d: { id: string }) => d.id)
      expect(unfilteredIds).not.toContain(otherDoc.id)

      const filteredByOtherProperty = await getDocumentsNoMonth(otherProp.id)
      expect(filteredByOtherProperty.status).toBe(200)
      const filteredJson = await filteredByOtherProperty.json()
      expect(filteredJson.documents).toEqual([])
    } finally {
      await db.delete(propertyLedger).where(eq(propertyLedger.sourceDocumentId, otherDoc.id))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, otherDoc.id))
      await db.delete(properties).where(eq(properties.id, otherProp.id))
    }
  })
})
