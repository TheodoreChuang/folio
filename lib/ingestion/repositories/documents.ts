import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger, sourceDocuments } from '@/db/schema'
import type { NewSourceDocument, SourceDocument } from '@/db/schema'

export type DocumentForMonth = {
  id: string
  fileName: string
  propertyId: string
  uploadedAt: Date
}

export async function getDocumentsByUser(userId: string): Promise<SourceDocument[]> {
  return db
    .select()
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.userId, userId), isNull(sourceDocuments.deletedAt)))
}

export async function findSourceDocumentByHash(userId: string, hash: string): Promise<SourceDocument | null> {
  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.userId, userId),
      eq(sourceDocuments.fileHash, hash),
      isNull(sourceDocuments.deletedAt),
    ))
    .limit(1)
  return doc ?? null
}

export async function insertSourceDocument(values: NewSourceDocument): Promise<SourceDocument> {
  const [doc] = await db
    .insert(sourceDocuments)
    .values(values)
    .returning()
  return doc
}

export async function findSourceDocumentById(userId: string, id: string): Promise<SourceDocument | null> {
  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.id, id),
      eq(sourceDocuments.userId, userId),
      isNull(sourceDocuments.deletedAt),
    ))
    .limit(1)
  return doc ?? null
}

export async function countRecentUploads(userId: string, since: Date): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.userId, userId),
      gte(sourceDocuments.uploadedAt, since),
    ))
  return count
}

export async function updateSourceDocumentType(userId: string, id: string, documentType: string): Promise<void> {
  await db
    .update(sourceDocuments)
    .set({ documentType })
    .where(and(
      eq(sourceDocuments.id, id),
      eq(sourceDocuments.userId, userId),
      isNull(sourceDocuments.deletedAt),
    ))
    .returning()
}

export async function listDocumentsForMonth(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DocumentForMonth[]> {
  const rows = await db
    .selectDistinctOn(
      [propertyLedger.propertyId, propertyLedger.sourceDocumentId],
      {
        id: sourceDocuments.id,
        fileName: sourceDocuments.fileName,
        propertyId: propertyLedger.propertyId,
        uploadedAt: sourceDocuments.uploadedAt,
      }
    )
    .from(propertyLedger)
    .innerJoin(sourceDocuments, eq(propertyLedger.sourceDocumentId, sourceDocuments.id))
    .where(
      and(
        eq(propertyLedger.userId, userId),
        gte(propertyLedger.lineItemDate, startDate),
        lte(propertyLedger.lineItemDate, endDate),
        isNotNull(propertyLedger.sourceDocumentId),
        isNull(propertyLedger.deletedAt),
        isNull(sourceDocuments.deletedAt),
      )
    )

  return rows.map(r => ({
    id: r.id,
    fileName: r.fileName,
    propertyId: r.propertyId,
    uploadedAt: r.uploadedAt,
  }))
}

export async function softDeleteDocumentWithEntries(
  userId: string,
  id: string,
): Promise<{ entriesDeleted: number }> {
  let entriesDeleted = 0
  await db.transaction(async (tx) => {
    const softDeletedEntries = await tx
      .update(propertyLedger)
      .set({ deletedAt: new Date() })
      .where(and(eq(propertyLedger.sourceDocumentId, id), isNull(propertyLedger.deletedAt)))
      .returning()
    entriesDeleted = softDeletedEntries.length

    await tx
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(and(eq(sourceDocuments.id, id), eq(sourceDocuments.userId, userId)))
  })
  return { entriesDeleted }
}
