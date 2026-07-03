import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger, properties, installmentLoans } from '@/db/schema'
import type { Property, InstallmentLoan, PropertyLedger, LedgerCategory } from '@/db/schema'

export async function findLedgerEntryById(
  userId: string,
  id: string,
): Promise<PropertyLedger | undefined> {
  const [entry] = await db
    .select()
    .from(propertyLedger)
    .where(and(
      eq(propertyLedger.id, id),
      eq(propertyLedger.userId, userId),
      isNull(propertyLedger.deletedAt),
    ))
    .limit(1)
  return entry
}

// R10: a user-initiated single delete. deletionReason='user_deleted' is what the R18
// re-upload warning keys on — only these rows are surfaced as previously-deleted.
export async function deleteLedgerEntry(
  userId: string,
  id: string,
): Promise<PropertyLedger | undefined> {
  // isNull(deletedAt): a no-op on an already-deleted row, so a concurrent correction/void
  // (which sets reason='superseded'/'voided') is never clobbered back to 'user_deleted' —
  // that would wrongly surface the row in the R18 re-upload warning.
  const [updated] = await db
    .update(propertyLedger)
    .set({ deletedAt: new Date(), deletionReason: 'user_deleted' })
    .where(and(
      eq(propertyLedger.id, id),
      eq(propertyLedger.userId, userId),
      isNull(propertyLedger.deletedAt),
    ))
    .returning()
  return updated
}

export type LedgerCorrection = Partial<{
  category: LedgerCategory
  amountCents: number
  lineItemDate: string
  description: string | null
}>

// R9/R11: correct a confirmed transaction without mutating a ledger row in place. The
// original is soft-deleted (reason='superseded') and a new row is inserted carrying the
// edited values plus supersededByEntryId back to the original. Returns null if the entry
// is not found or not owned by the caller.
export async function correctLedgerEntry(
  userId: string,
  id: string,
  patch: LedgerCorrection,
): Promise<PropertyLedger | null> {
  let created: PropertyLedger | null = null
  await db.transaction(async (tx) => {
    // FOR UPDATE: lock the original inside the txn. A concurrent PATCH on the same entry
    // (double-click / retry) blocks here; once the first commits, the second re-evaluates
    // isNull(deletedAt) against the now-superseded row, matches nothing, and early-returns —
    // preventing two active rows that both supersede the original (double-counted totals).
    const [original] = await tx
      .select()
      .from(propertyLedger)
      .where(and(
        eq(propertyLedger.id, id),
        eq(propertyLedger.userId, userId),
        isNull(propertyLedger.deletedAt),
      ))
      .for('update')
      .limit(1)
    if (!original) return

    await tx
      .update(propertyLedger)
      .set({ deletedAt: new Date(), deletionReason: 'superseded' })
      .where(and(eq(propertyLedger.id, id), eq(propertyLedger.userId, userId)))

    const [inserted] = await tx
      .insert(propertyLedger)
      .values({
        userId: original.userId,
        propertyId: original.propertyId,
        sourceDocumentId: original.sourceDocumentId,
        installmentLoanId: original.installmentLoanId,
        lineItemDate: patch.lineItemDate ?? original.lineItemDate,
        amountCents: patch.amountCents ?? original.amountCents,
        category: patch.category ?? original.category,
        description: patch.description !== undefined ? patch.description : original.description,
        userNotes: original.userNotes,
        supersededByEntryId: original.id,
      })
      .returning()
    created = inserted
  })
  return created
}

export async function listPropertiesActiveInRange(
  userId: string,
  from: string,
  to: string,
  propertyId?: string | null,
  entityId?: string | null,
): Promise<Property[]> {
  const where = [
    eq(properties.userId, userId),
    lte(properties.startDate, to),
    or(isNull(properties.endDate), gte(properties.endDate, from)),
    ...(propertyId ? [eq(properties.id, propertyId)] : []),
    ...(entityId ? [eq(properties.entityId, entityId)] : []),
  ]
  return db.select().from(properties).where(and(...where))
}

export async function listLoansActiveInRange(
  userId: string,
  from: string,
  to: string,
  entityId?: string | null,
): Promise<InstallmentLoan[]> {
  const where = [
    eq(installmentLoans.userId, userId),
    lte(installmentLoans.startDate, to),
    gte(installmentLoans.endDate, from),
    ...(entityId ? [eq(installmentLoans.entityId, entityId)] : []),
  ]
  return db.select().from(installmentLoans).where(and(...where))
}

// Fetches ledger entries in range. If propertyIds is an empty array, returns [] immediately
// (signals "filter applied but no matching properties"). If undefined, fetches for all user properties.
export async function listLedgerEntriesInRange(
  userId: string,
  from: string,
  to: string,
  propertyIds?: string[],
  category?: LedgerCategory,
): Promise<PropertyLedger[]> {
  if (propertyIds !== undefined && propertyIds.length === 0) return []
  const where = [
    eq(propertyLedger.userId, userId),
    gte(propertyLedger.lineItemDate, from),
    lte(propertyLedger.lineItemDate, to),
    isNull(propertyLedger.deletedAt),
    ...(propertyIds ? [inArray(propertyLedger.propertyId, propertyIds)] : []),
    ...(category ? [eq(propertyLedger.category, category)] : []),
  ]
  return db.select().from(propertyLedger).where(and(...where))
}
