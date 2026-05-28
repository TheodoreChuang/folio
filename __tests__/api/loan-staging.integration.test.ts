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

// ── End-to-end staging pipeline ──────────────────────────────────────────────

describe('loan staging pipeline (stage → patch → commit)', () => {
  let userId: string
  let propertyId: string
  let loanId: string
  let docId: string

  beforeAll(async () => {
    if (!hasEnv) return

    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Loan Staging Pipeline ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [loan] = await db
      .insert(installmentLoans)
      .values({ userId, propertyId, lender: 'Pipeline Lender', startDate: '2020-01-01', endDate: '2050-01-01' })
      .returning()
    loanId = loan.id

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: 'pipeline-stmt.pdf',
        fileHash: `pipeline-${crypto.randomUUID()}`,
        documentType: 'loan_statement',
        filePath: `documents/${userId}/loan_statements/pipeline-stmt.pdf`,
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

  it('staging creates items with pending status and correct field values', async () => {
    if (!hasEnv) return

    const { stagedCount } = await stageLoanExtractionResult(userId, docId, {
      lenderName: 'Pipeline Lender',
      statementPeriodStart: '2026-05-01',
      statementPeriodEnd: '2026-05-31',
      closingBalanceCents: 48000000,
      payments: [
        {
          paymentDate: '2026-05-10',
          amountCents: 210000,
          interestCents: 150000,
          principalCents: 60000,
          description: 'Monthly repayment',
          confidence: 'high' as const,
        },
        {
          paymentDate: '2026-05-25',
          amountCents: 50000,
          confidence: 'medium' as const,
        },
      ],
    })

    expect(stagedCount).toBe(2)

    const items = await db
      .select()
      .from(loanStagingItems)
      .where(and(eq(loanStagingItems.userId, userId), eq(loanStagingItems.sourceDocumentId, docId)))

    expect(items).toHaveLength(2)
    const sorted = items.sort((a, b) => a.lineItemIndex - b.lineItemIndex)

    expect(sorted[0].status).toBe('pending')
    expect(sorted[0].amountCents).toBe(210000)
    expect(sorted[0].interestCents).toBe(150000)
    expect(sorted[0].principalCents).toBe(60000)
    expect(sorted[0].description).toBe('Monthly repayment')
    expect(sorted[0].confidence).toBe('high')
    expect(sorted[0].installmentLoanId).toBeNull()

    expect(sorted[1].status).toBe('pending')
    expect(sorted[1].amountCents).toBe(50000)
    expect(sorted[1].confidence).toBe('medium')
  })

  it('patchLoanStagedItem sets installmentLoanId and status', async () => {
    if (!hasEnv) return

    const items = await db
      .select()
      .from(loanStagingItems)
      .where(and(eq(loanStagingItems.userId, userId), eq(loanStagingItems.sourceDocumentId, docId)))

    for (const item of items) {
      const patched = await patchLoanStagedItem(item.id, userId, {
        installmentLoanId: loanId,
        status: 'approved',
      })
      expect(patched).not.toBeNull()
      expect(patched!.installmentLoanId).toBe(loanId)
      expect(patched!.status).toBe('approved')
    }
  })

  it('commit inserts loan_ledger rows with correct values and deletes staging items', async () => {
    if (!hasEnv) return

    const { committed } = await commitLoanStagedItems(userId, [docId])
    expect(committed).toBe(2)

    // loan_ledger has 2 active entries for this source doc
    const ledgerEntries = await db
      .select()
      .from(loanLedger)
      .where(and(
        eq(loanLedger.userId, userId),
        eq(loanLedger.sourceDocumentId, docId),
        isNull(loanLedger.deletedAt),
      ))

    expect(ledgerEntries).toHaveLength(2)
    const sorted = ledgerEntries.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))

    expect(sorted[0].paymentDate).toBe('2026-05-10')
    expect(sorted[0].amountCents).toBe(210000)
    expect(sorted[0].interestCents).toBe(150000)
    expect(sorted[0].principalCents).toBe(60000)
    expect(sorted[0].installmentLoanId).toBe(loanId)

    expect(sorted[1].paymentDate).toBe('2026-05-25')
    expect(sorted[1].amountCents).toBe(50000)

    // all staging items for this doc deleted
    const remainingStaging = await db
      .select()
      .from(loanStagingItems)
      .where(and(eq(loanStagingItems.userId, userId), eq(loanStagingItems.sourceDocumentId, docId)))

    expect(remainingStaging).toHaveLength(0)
  })
})
