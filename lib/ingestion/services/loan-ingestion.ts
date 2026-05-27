import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loanLedger, sourceDocuments, installmentLoans } from '@/db/schema'
import type { LoanExtractionResult } from '../extraction/schema'
import {
  insertLoanStagedItems,
  deleteLoanStagedBySourceDocument,
  deleteLoanStagedBySourceDocumentIds,
  listApprovedLoanItems,
} from '../repositories/loan-staging'

export async function stageLoanExtractionResult(
  userId: string,
  sourceDocumentId: string,
  result: LoanExtractionResult,
): Promise<{ stagedCount: number }> {
  let stagedCount = 0

  await db.transaction(async (tx) => {
    await tx
      .update(sourceDocuments)
      .set({
        periodStart: result.statementPeriodStart,
        periodEnd: result.statementPeriodEnd,
      })
      .where(and(
        eq(sourceDocuments.id, sourceDocumentId),
        eq(sourceDocuments.userId, userId),
      ))
      .returning()

    if (result.payments.length === 0) return

    await deleteLoanStagedBySourceDocument(tx, userId, sourceDocumentId)

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
      installmentLoanId: null,
      status: 'pending' as const,
    }))

    const inserted = await insertLoanStagedItems(tx, rows)
    stagedCount = inserted.length
  })

  return { stagedCount }
}

export async function commitLoanStagedItems(
  userId: string,
  sourceDocumentIds: string[],
): Promise<{ committed: number }> {
  if (sourceDocumentIds.length === 0) return { committed: 0 }

  const docs = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.userId, userId),
      inArray(sourceDocuments.id, sourceDocumentIds),
      isNull(sourceDocuments.deletedAt),
    ))

  if (docs.length !== sourceDocumentIds.length) {
    throw new Error('One or more source documents not found or not owned by user')
  }

  const approved = await listApprovedLoanItems(userId, sourceDocumentIds)

  const unmatched = approved.filter(item => item.installmentLoanId === null)
  if (unmatched.length > 0) {
    throw new Error(
      `${unmatched.length} approved item(s) have no installmentLoanId — assign a loan before committing`
    )
  }

  const committable = approved.filter(
    (item): item is typeof item & { installmentLoanId: string } => item.installmentLoanId !== null
  )

  if (committable.length > 0) {
    const loanIds = [...new Set(committable.map(item => item.installmentLoanId))]
    const ownedLoans = await db
      .select({ id: installmentLoans.id })
      .from(installmentLoans)
      .where(and(
        eq(installmentLoans.userId, userId),
        inArray(installmentLoans.id, loanIds),
      ))
    if (ownedLoans.length !== loanIds.length) {
      throw new Error('One or more loans not found or not owned by user')
    }
  }

  let committed = 0

  await db.transaction(async (tx) => {
    await tx
      .update(loanLedger)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(loanLedger.userId, userId),
        inArray(loanLedger.sourceDocumentId, sourceDocumentIds),
        isNull(loanLedger.deletedAt),
      ))
      .returning()

    if (committable.length > 0) {
      const rows = committable.map((item) => ({
        userId: item.userId,
        installmentLoanId: item.installmentLoanId,
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

    await deleteLoanStagedBySourceDocumentIds(tx, userId, sourceDocumentIds)
  })

  return { committed }
}
