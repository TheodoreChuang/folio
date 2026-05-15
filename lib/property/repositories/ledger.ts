import { and, eq, gte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger } from '@/db/schema'
import type { PropertyLedger, LedgerCategory } from '@/db/schema'

type CreateLedgerEntryInput = {
  userId: string
  propertyId: string
  lineItemDate: string
  amountCents: number
  category: LedgerCategory
  description: string | null
  sourceDocumentId?: string | null
  loanAccountId?: string | null
}

export async function findTrailing12mEntries(
  userId: string,
  propertyId: string,
): Promise<PropertyLedger[]> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
  const cutoff = twelveMonthsAgo.toISOString().slice(0, 10)

  return db
    .select()
    .from(propertyLedger)
    .where(
      and(
        eq(propertyLedger.userId, userId),
        eq(propertyLedger.propertyId, propertyId),
        gte(propertyLedger.lineItemDate, cutoff),
        isNull(propertyLedger.deletedAt),
      ),
    )
}

export async function createLedgerEntry(input: CreateLedgerEntryInput): Promise<PropertyLedger> {
  const [row] = await db
    .insert(propertyLedger)
    .values({
      userId: input.userId,
      propertyId: input.propertyId,
      sourceDocumentId: input.sourceDocumentId ?? null,
      loanAccountId: input.loanAccountId ?? null,
      lineItemDate: input.lineItemDate,
      amountCents: input.amountCents,
      category: input.category,
      description: input.description,
    })
    .returning()
  return row
}
