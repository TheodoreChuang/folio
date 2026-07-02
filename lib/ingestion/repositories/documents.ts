import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger, propertyStagingItems, sourceDocuments } from '@/db/schema'
import type { NewSourceDocument, SourceDocument } from '@/db/schema'

export type PreviouslyDeletedEntry = {
  lineItemDate: string
  amountCents: number
  description: string | null
}

export type DocumentForDateRange = {
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

// Ownership lookup that ignores deletedAt/status — used to validate a Replace target
// (R23), which has already been voided (deletedAt set) by the time the new file uploads.
export async function findOwnedSourceDocumentAnyStatus(userId: string, id: string): Promise<SourceDocument | null> {
  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.id, id),
      eq(sourceDocuments.userId, userId),
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

export async function updateSourceDocumentPeriod(
  userId: string,
  id: string,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  await db
    .update(sourceDocuments)
    .set({ periodStart, periodEnd })
    .where(and(
      eq(sourceDocuments.id, id),
      eq(sourceDocuments.userId, userId),
      isNull(sourceDocuments.deletedAt),
    ))
}

export async function listDocumentsForDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DocumentForDateRange[]> {
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

export async function countActiveLinkedTransactions(userId: string, id: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(propertyLedger)
    .where(and(
      eq(propertyLedger.userId, userId),
      eq(propertyLedger.sourceDocumentId, id),
      isNull(propertyLedger.deletedAt),
    ))
  return count
}

// Void (R3): a confirmed upload — soft-delete its linked ledger rows with
// deletionReason='voided' and mark the document 'voided'. The 'voided' reason keeps
// these rows out of the R18 re-upload warning (they are expected to reappear).
// R18: for a new pending upload, list the transactions the user individually deleted
// (deletionReason='user_deleted') from the prior upload(s) it supersedes. Prior uploads
// are resolved two ways: the explicit Replace link (authoritative, survives a changed
// hash) and same-hash voided/dismissed rows (the hash fallback). Rows deleted by a void
// ('voided') or a correction ('superseded') are intentionally excluded.
export async function listPreviouslyDeletedForReupload(
  userId: string,
  currentDoc: { id: string; fileHash: string; replacesSourceDocumentId: string | null },
): Promise<PreviouslyDeletedEntry[]> {
  const priorDocs = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.userId, userId),
      eq(sourceDocuments.fileHash, currentDoc.fileHash),
      ne(sourceDocuments.id, currentDoc.id),
      inArray(sourceDocuments.status, ['voided', 'dismissed']),
    ))

  const priorIds = new Set(priorDocs.map((d) => d.id))
  if (currentDoc.replacesSourceDocumentId) priorIds.add(currentDoc.replacesSourceDocumentId)
  if (priorIds.size === 0) return []

  return db
    .select({
      lineItemDate: propertyLedger.lineItemDate,
      amountCents: propertyLedger.amountCents,
      description: propertyLedger.description,
    })
    .from(propertyLedger)
    .where(and(
      eq(propertyLedger.userId, userId),
      inArray(propertyLedger.sourceDocumentId, [...priorIds]),
      eq(propertyLedger.deletionReason, 'user_deleted'),
    ))
}

export async function softDeleteDocumentWithEntries(
  userId: string,
  id: string,
): Promise<{ entriesDeleted: number }> {
  let entriesDeleted = 0
  await db.transaction(async (tx) => {
    const softDeletedEntries = await tx
      .update(propertyLedger)
      .set({ deletedAt: new Date(), deletionReason: 'voided' })
      .where(and(eq(propertyLedger.sourceDocumentId, id), isNull(propertyLedger.deletedAt)))
      .returning()
    entriesDeleted = softDeletedEntries.length

    await tx
      .update(sourceDocuments)
      .set({ deletedAt: new Date(), status: 'voided' })
      .where(and(eq(sourceDocuments.id, id), eq(sourceDocuments.userId, userId)))
  })
  return { entriesDeleted }
}

// Dismiss (R2): a pending upload — clear its staging rows and mark the document
// 'dismissed'. No ledger rows exist yet, so none are touched.
export async function dismissPendingDocument(
  userId: string,
  id: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(propertyStagingItems)
      .where(and(
        eq(propertyStagingItems.userId, userId),
        eq(propertyStagingItems.sourceDocumentId, id),
      ))

    await tx
      .update(sourceDocuments)
      .set({ deletedAt: new Date(), status: 'dismissed' })
      .where(and(eq(sourceDocuments.id, id), eq(sourceDocuments.userId, userId)))
  })
}
