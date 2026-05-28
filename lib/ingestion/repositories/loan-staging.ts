import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DrizzleTx } from '@/lib/db'
import { loanStagingItems } from '@/db/schema'
import type { LoanStagingItem, NewLoanStagingItem } from '@/db/schema'

export async function insertLoanStagedItems(
  tx: DrizzleTx,
  items: NewLoanStagingItem[],
): Promise<LoanStagingItem[]> {
  return tx.insert(loanStagingItems).values(items).returning()
}

export async function deleteLoanStagedBySourceDocument(
  tx: DrizzleTx,
  userId: string,
  sourceDocumentId: string,
): Promise<void> {
  await tx
    .delete(loanStagingItems)
    .where(and(
      eq(loanStagingItems.userId, userId),
      eq(loanStagingItems.sourceDocumentId, sourceDocumentId),
    ))
    .returning()
}

export async function deleteLoanStagedBySourceDocumentIds(
  tx: DrizzleTx,
  userId: string,
  sourceDocumentIds: string[],
): Promise<void> {
  await tx
    .delete(loanStagingItems)
    .where(and(
      eq(loanStagingItems.userId, userId),
      inArray(loanStagingItems.sourceDocumentId, sourceDocumentIds),
    ))
    .returning()
}

export async function listApprovedLoanItems(
  userId: string,
  sourceDocumentIds: string[],
): Promise<LoanStagingItem[]> {
  return db
    .select()
    .from(loanStagingItems)
    .where(and(
      eq(loanStagingItems.userId, userId),
      inArray(loanStagingItems.sourceDocumentId, sourceDocumentIds),
      eq(loanStagingItems.status, 'approved'),
    ))
}

type LoanStagedItemPatch = Partial<{
  installmentLoanId: string | null
  status: 'pending' | 'approved' | 'rejected'
}>

export async function patchLoanStagedItem(
  id: string,
  userId: string,
  patch: LoanStagedItemPatch,
): Promise<LoanStagingItem | null> {
  const [row] = await db
    .update(loanStagingItems)
    .set(patch)
    .where(and(eq(loanStagingItems.id, id), eq(loanStagingItems.userId, userId)))
    .returning()
  return row ?? null
}

export async function listLoanStagedByUser(
  userId: string,
): Promise<LoanStagingItem[]> {
  return db
    .select()
    .from(loanStagingItems)
    .where(eq(loanStagingItems.userId, userId))
}

export async function listLoanStagedBySourceDocumentIds(
  userId: string,
  sourceDocumentIds: string[],
): Promise<LoanStagingItem[]> {
  return db
    .select()
    .from(loanStagingItems)
    .where(and(
      eq(loanStagingItems.userId, userId),
      inArray(loanStagingItems.sourceDocumentId, sourceDocumentIds),
    ))
}
