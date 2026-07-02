import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyStagingItems } from '@/db/schema'
import type { PropertyStagingItem, NewPropertyStagingItem, LedgerCategory } from '@/db/schema'

export async function deletePropertyStagedBySourceDocument(
  userId: string,
  sourceDocumentId: string,
): Promise<void> {
  await db
    .delete(propertyStagingItems)
    .where(and(
      eq(propertyStagingItems.userId, userId),
      eq(propertyStagingItems.sourceDocumentId, sourceDocumentId),
    ))
    .returning()
}

export async function insertStagedItems(
  items: NewPropertyStagingItem[],
): Promise<PropertyStagingItem[]> {
  return db.insert(propertyStagingItems).values(items).returning()
}

export async function listStagedByUser(
  userId: string,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<PropertyStagingItem[]> {
  const conditions = [eq(propertyStagingItems.userId, userId)]
  if (status !== undefined) {
    conditions.push(eq(propertyStagingItems.status, status))
  }
  return db
    .select()
    .from(propertyStagingItems)
    .where(and(...conditions))
}

export async function listStagedBySourceDocumentIds(
  userId: string,
  sourceDocumentIds: string[],
): Promise<PropertyStagingItem[]> {
  return db
    .select()
    .from(propertyStagingItems)
    .where(
      and(
        eq(propertyStagingItems.userId, userId),
        inArray(propertyStagingItems.sourceDocumentId, sourceDocumentIds),
      )
    )
}

type StagedItemPatch = Partial<{
  propertyId: string | null
  category: LedgerCategory
  description: string
  amountCents: number
  lineItemDate: string
  status: 'pending' | 'approved' | 'rejected'
}>

// Staged items are not ledger rows, so pre-confirmation edits (R21) do not violate the
// append-only ledger rule.
export async function patchStagedItem(
  id: string,
  userId: string,
  patch: StagedItemPatch,
): Promise<PropertyStagingItem | null> {
  const [row] = await db
    .update(propertyStagingItems)
    .set(patch)
    .where(and(eq(propertyStagingItems.id, id), eq(propertyStagingItems.userId, userId)))
    .returning()
  return row ?? null
}

// R7 "remove from import" — hard-deletes a staged item (it was never a ledger row).
// Distinct from the post-confirmation ledger delete (U7).
export async function deleteStagedItem(
  id: string,
  userId: string,
): Promise<PropertyStagingItem | null> {
  const [row] = await db
    .delete(propertyStagingItems)
    .where(and(eq(propertyStagingItems.id, id), eq(propertyStagingItems.userId, userId)))
    .returning()
  return row ?? null
}

export async function countStagedByDocument(
  userId: string,
  sourceDocumentId: string,
): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(propertyStagingItems)
    .where(and(
      eq(propertyStagingItems.userId, userId),
      eq(propertyStagingItems.sourceDocumentId, sourceDocumentId),
    ))
  return count
}
