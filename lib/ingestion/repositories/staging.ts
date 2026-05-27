import { and, eq, inArray } from 'drizzle-orm'
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
  status: 'pending' | 'approved' | 'rejected'
}>

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
