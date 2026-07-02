import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyStagingItems, propertyLedger, sourceDocuments } from '@/db/schema'
import type { ExtractionResult } from '../extraction/schema'
import { insertStagedItems, deletePropertyStagedBySourceDocument } from '../repositories/staging'
import { updateSourceDocumentPeriod } from '../repositories/documents'

export async function stageExtractionResult(
  userId: string,
  sourceDocumentId: string,
  result: ExtractionResult,
): Promise<{ stagedCount: number }> {
  const items = result.lineItems.map((item, index) => ({
    userId,
    sourceDocumentId,
    lineItemIndex: index,
    lineItemDate: item.lineItemDate,
    amountCents: item.amountCents,
    category: item.category,
    description: item.description,
    confidence: item.confidence,
    propertyId: null as string | null,
    installmentLoanId: item.loanAccountId ?? null,
    status: 'pending' as const,
  }))

  await deletePropertyStagedBySourceDocument(userId, sourceDocumentId)
  await updateSourceDocumentPeriod(
    userId,
    sourceDocumentId,
    result.statementPeriodStart,
    result.statementPeriodEnd,
  )
  // A zero-transaction statement is valid (R22) — skip the insert, which would throw on
  // an empty VALUES list, and report an empty staged set.
  if (items.length === 0) return { stagedCount: 0 }
  const inserted = await insertStagedItems(items)
  return { stagedCount: inserted.length }
}

export async function commitStagedItems(
  userId: string,
  sourceDocumentIds: string[],
): Promise<{ committed: number }> {
  // Validate all sourceDocumentIds belong to this user
  const docs = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.userId, userId),
        inArray(sourceDocuments.id, sourceDocumentIds),
        isNull(sourceDocuments.deletedAt),
      )
    )

  if (docs.length !== sourceDocumentIds.length) {
    throw new Error('One or more source documents not found or not owned by user')
  }

  // Fetch approved staging items for these documents
  const approved = await db
    .select()
    .from(propertyStagingItems)
    .where(
      and(
        eq(propertyStagingItems.userId, userId),
        inArray(propertyStagingItems.sourceDocumentId, sourceDocumentIds),
        eq(propertyStagingItems.status, 'approved'),
      )
    )

  // All approved items must have a propertyId — ledger requires it
  const missingProperty = approved.filter(item => item.propertyId === null)
  if (missingProperty.length > 0) {
    throw new Error(
      `${missingProperty.length} approved item(s) have no propertyId — assign a property before committing`
    )
  }

  let committed = 0

  await db.transaction(async (tx) => {
    // Soft-delete prior property_ledger rows for these source documents (re-commit
    // overwrite). deletionReason stays null — these are not user deletions and must
    // never trigger the R18 re-upload warning.
    await tx
      .update(propertyLedger)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(propertyLedger.userId, userId),
          inArray(propertyLedger.sourceDocumentId, sourceDocumentIds),
          isNull(propertyLedger.deletedAt),
        )
      )

    const committable = approved.filter(
      (item): item is typeof item & { propertyId: string } => item.propertyId !== null
    )

    if (committable.length > 0) {
      const rows = committable.map((item) => ({
        userId: item.userId,
        propertyId: item.propertyId,
        sourceDocumentId: item.sourceDocumentId,
        installmentLoanId: item.installmentLoanId,
        lineItemDate: item.lineItemDate,
        amountCents: item.amountCents,
        category: item.category,
        description: item.description,
      }))

      const inserted = await tx.insert(propertyLedger).values(rows).returning()
      committed = inserted.length
    }

    // Per-document lifecycle (R8/R7): documents that produced ledger rows become
    // 'confirmed'; documents with nothing committable are auto-dismissed rather than
    // left dangling in 'pending'.
    const confirmedDocIds = [...new Set(committable.map((item) => item.sourceDocumentId))]
    const dismissedDocIds = sourceDocumentIds.filter((id) => !confirmedDocIds.includes(id))

    if (confirmedDocIds.length > 0) {
      await tx
        .update(sourceDocuments)
        .set({ status: 'confirmed' })
        .where(
          and(
            eq(sourceDocuments.userId, userId),
            inArray(sourceDocuments.id, confirmedDocIds),
          )
        )
    }
    if (dismissedDocIds.length > 0) {
      await tx
        .update(sourceDocuments)
        .set({ status: 'dismissed', deletedAt: new Date() })
        .where(
          and(
            eq(sourceDocuments.userId, userId),
            inArray(sourceDocuments.id, dismissedDocIds),
          )
        )
    }

    // Clean up all staging items for committed documents (committed or skipped)
    await tx
      .delete(propertyStagingItems)
      .where(
        and(
          eq(propertyStagingItems.userId, userId),
          inArray(propertyStagingItems.sourceDocumentId, sourceDocumentIds),
        )
      )
  })

  return { committed }
}
