import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoans, loanLedger, loanStagingItems, properties, sourceDocuments } from '@/db/schema'
import { stageLoanExtractionResult, commitLoanStagedItems, patchLoanStagedItem } from '@/lib/ingestion'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

async function signIn(): Promise<string> {
  const anon = createClient(url!, anonKey!)
  const { data: { session }, error } = await anon.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  })
  if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
  return session.user.id
}

// ── Commit-time soft-delete idempotency ──────────────────────────────────────

describe('loan_ledger commit idempotency (re-commit soft-deletes old entries)', () => {
  let userId: string
  let propertyId: string
  let loanId: string
  let docId: string

  beforeAll(async () => {
    if (!hasEnv) return
    userId = await signIn()

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Loan Ledger Idempotency ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [loan] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId, lender: 'Idempotency Lender', startDate: '2020-01-01', endDate: '2050-01-01' })
      .returning()
    loanId = loan.id

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: 'idempotency-stmt.pdf',
        fileHash: `idem-${crypto.randomUUID()}`,
        documentType: 'loan_statement',
        filePath: `documents/${userId}/loan_statements/idempotency-stmt.pdf`,
      })
      .returning()
    docId = doc.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (docId) {
      await db.delete(loanLedger).where(eq(loanLedger.sourceDocumentId, docId))
      await db.delete(loanStagingItems).where(eq(loanStagingItems.sourceDocumentId, docId))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, docId))
    }
    if (loanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  it('re-committing the same source doc soft-deletes prior entries and inserts fresh ones', async () => {
    if (!hasEnv) return

    const payment = {
      paymentDate: '2026-03-01',
      amountCents: 200000,
      interestCents: 140000,
      principalCents: 60000,
      confidence: 'high' as const,
    }

    // First staging → patch → commit
    await stageLoanExtractionResult(userId, docId, {
      lenderName: 'Test Lender',
      statementPeriodStart: '2026-03-01',
      statementPeriodEnd: '2026-03-31',
      closingBalanceCents: 50000000,
      payments: [payment],
    })

    const [firstItem] = await db
      .select()
      .from(loanStagingItems)
      .where(and(eq(loanStagingItems.userId, userId), eq(loanStagingItems.sourceDocumentId, docId)))

    await patchLoanStagedItem(firstItem.id, userId, { installmentLoanId: loanId, status: 'approved' })
    const first = await commitLoanStagedItems(userId, [docId])
    expect(first.committed).toBe(1)

    // Re-stage same doc → patch → commit
    await stageLoanExtractionResult(userId, docId, {
      lenderName: 'Test Lender',
      statementPeriodStart: '2026-03-01',
      statementPeriodEnd: '2026-03-31',
      closingBalanceCents: 50000000,
      payments: [payment],
    })

    const [secondItem] = await db
      .select()
      .from(loanStagingItems)
      .where(and(eq(loanStagingItems.userId, userId), eq(loanStagingItems.sourceDocumentId, docId)))

    await patchLoanStagedItem(secondItem.id, userId, { installmentLoanId: loanId, status: 'approved' })
    const second = await commitLoanStagedItems(userId, [docId])
    expect(second.committed).toBe(1)

    // Only 1 active loan_ledger entry for this sourceDoc (old one was soft-deleted)
    const activeEntries = await db
      .select()
      .from(loanLedger)
      .where(and(
        eq(loanLedger.userId, userId),
        eq(loanLedger.sourceDocumentId, docId),
        isNull(loanLedger.deletedAt),
      ))
    expect(activeEntries).toHaveLength(1)

    // 2 total rows: one soft-deleted, one active
    const allEntries = await db
      .select()
      .from(loanLedger)
      .where(and(eq(loanLedger.userId, userId), eq(loanLedger.sourceDocumentId, docId)))
    expect(allEntries).toHaveLength(2)
    const deletedCount = allEntries.filter(e => e.deletedAt !== null).length
    expect(deletedCount).toBe(1)
  })
})

// ── Cross-parent scope ────────────────────────────────────────────────────────

describe('commitLoanStagedItems cross-scope (source doc isolation)', () => {
  let userId: string
  let propertyId: string
  let loanId: string
  let doc1Id: string
  let doc2Id: string

  beforeAll(async () => {
    if (!hasEnv) return
    userId = await signIn()

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Loan Ledger Scope ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [loan] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId, lender: 'Scope Lender', startDate: '2020-01-01', endDate: '2050-01-01' })
      .returning()
    loanId = loan.id

    const [d1] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: 'scope-stmt-1.pdf',
        fileHash: `scope1-${crypto.randomUUID()}`,
        documentType: 'loan_statement',
        filePath: `documents/${userId}/loan_statements/scope-stmt-1.pdf`,
      })
      .returning()
    doc1Id = d1.id

    const [d2] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: 'scope-stmt-2.pdf',
        fileHash: `scope2-${crypto.randomUUID()}`,
        documentType: 'loan_statement',
        filePath: `documents/${userId}/loan_statements/scope-stmt-2.pdf`,
      })
      .returning()
    doc2Id = d2.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (doc1Id) {
      await db.delete(loanLedger).where(eq(loanLedger.sourceDocumentId, doc1Id))
      await db.delete(loanStagingItems).where(eq(loanStagingItems.sourceDocumentId, doc1Id))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, doc1Id))
    }
    if (doc2Id) {
      await db.delete(loanLedger).where(eq(loanLedger.sourceDocumentId, doc2Id))
      await db.delete(loanStagingItems).where(eq(loanStagingItems.sourceDocumentId, doc2Id))
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, doc2Id))
    }
    if (loanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  it('committing doc2 (no staging items) returns committed=0 and leaves doc1 staging items intact', async () => {
    if (!hasEnv) return

    // Stage items for doc1 and approve them
    await stageLoanExtractionResult(userId, doc1Id, {
      lenderName: 'Scope Lender',
      statementPeriodStart: '2026-04-01',
      statementPeriodEnd: '2026-04-30',
      closingBalanceCents: 60000000,
      payments: [{
        paymentDate: '2026-04-15',
        amountCents: 180000,
        confidence: 'high' as const,
      }],
    })

    const [doc1Item] = await db
      .select()
      .from(loanStagingItems)
      .where(and(eq(loanStagingItems.userId, userId), eq(loanStagingItems.sourceDocumentId, doc1Id)))

    await patchLoanStagedItem(doc1Item.id, userId, { installmentLoanId: loanId, status: 'approved' })

    // Commit only doc2 (which has no staging items at all)
    const result = await commitLoanStagedItems(userId, [doc2Id])
    expect(result.committed).toBe(0)

    // doc1's staging items must be untouched
    const doc1Remaining = await db
      .select()
      .from(loanStagingItems)
      .where(and(
        eq(loanStagingItems.userId, userId),
        eq(loanStagingItems.sourceDocumentId, doc1Id),
      ))
    expect(doc1Remaining).toHaveLength(1)
    expect(doc1Remaining[0].id).toBe(doc1Item.id)

    // No loan_ledger rows should have been created for doc2
    const doc2Ledger = await db
      .select()
      .from(loanLedger)
      .where(and(
        eq(loanLedger.userId, userId),
        eq(loanLedger.sourceDocumentId, doc2Id),
        isNull(loanLedger.deletedAt),
      ))
    expect(doc2Ledger).toHaveLength(0)
  })
})
