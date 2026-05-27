import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loanStagingItems, loanLedger, sourceDocuments } from '@/db/schema'
import type { LoanExtractionResult } from '../extraction/schema'

export async function stageLoanExtractionResult(
  userId: string,
  sourceDocumentId: string,
  result: LoanExtractionResult,
): Promise<{ stagedCount: number }> {
  await db
    .update(sourceDocuments)
    .set({
      periodStart: result.statementPeriodStart,
      periodEnd: result.statementPeriodEnd,
    })
    .where(eq(sourceDocuments.id, sourceDocumentId))

  if (result.payments.length === 0) {
    return { stagedCount: 0 }
  }

  const rows = result.payments.map((payment, index) => ({
    userId,
    sourceDocumentId,
    lineItemIndex: index,
    paymentDate: payment.paymentDate,
    amountCents: payment.amountCents,
    interestCents: payment.interestCents ?? null,
    principalCents: payment.principalCents ?? null,
    description: payment.description ?? null,
    confidence: payment.confidence,
    installmentLoanId: null as string | null,
    status: 'pending' as const,
  }))

  const inserted = await db.insert(loanStagingItems).values(rows).returning()
  return { stagedCount: inserted.length }
}

export async function commitLoanStagedItems(
  userId: string,
  sourceDocumentIds: string[],
): Promise<{ committed: number }> {
  const docs = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.userId, userId),
        inArray(sourceDocuments.id, sourceDocumentIds),
      )
    )

  if (docs.length !== sourceDocumentIds.length) {
    throw new Error('One or more source documents not found or not owned by user')
  }

  const approved = await db
    .select()
    .from(loanStagingItems)
    .where(
      and(
        eq(loanStagingItems.userId, userId),
        inArray(loanStagingItems.sourceDocumentId, sourceDocumentIds),
        eq(loanStagingItems.status, 'approved'),
      )
    )

  const unmatched = approved.filter(item => item.installmentLoanId === null)
  if (unmatched.length > 0) {
    throw new Error(
      `${unmatched.length} approved item(s) have no installmentLoanId — assign a loan before committing`
    )
  }

  let committed = 0

  await db.transaction(async (tx) => {
    if (approved.length > 0) {
      const rows = approved.map((item) => ({
        userId: item.userId,
        installmentLoanId: item.installmentLoanId as string,
        paymentDate: item.paymentDate,
        amountCents: item.amountCents,
        interestCents: item.interestCents,
        principalCents: item.principalCents,
        description: item.description,
        sourceDocumentId: item.sourceDocumentId,
      }))

      const inserted = await tx.insert(loanLedger).values(rows).returning()
      committed = inserted.length
    }

    await tx
      .delete(loanStagingItems)
      .where(
        and(
          eq(loanStagingItems.userId, userId),
          inArray(loanStagingItems.sourceDocumentId, sourceDocumentIds),
        )
      )
  })

  return { committed }
}
