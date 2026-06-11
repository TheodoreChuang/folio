import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger, properties, installmentLoans } from '@/db/schema'
import type { Property, InstallmentLoan, PropertyLedger } from '@/db/schema'

export async function fetchLedgerEntryById(
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

export async function softDeleteLedgerEntry(
  userId: string,
  id: string,
): Promise<PropertyLedger> {
  const [updated] = await db
    .update(propertyLedger)
    .set({ deletedAt: new Date() })
    .where(and(eq(propertyLedger.id, id), eq(propertyLedger.userId, userId)))
    .returning()
  return updated
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

export async function fetchLoansActiveInRange(
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
export async function fetchLedgerEntriesInRange(
  userId: string,
  from: string,
  to: string,
  propertyIds?: string[],
): Promise<PropertyLedger[]> {
  if (propertyIds !== undefined && propertyIds.length === 0) return []
  const where = [
    eq(propertyLedger.userId, userId),
    gte(propertyLedger.lineItemDate, from),
    lte(propertyLedger.lineItemDate, to),
    isNull(propertyLedger.deletedAt),
    ...(propertyIds ? [inArray(propertyLedger.propertyId, propertyIds)] : []),
  ]
  return db.select().from(propertyLedger).where(and(...where))
}
