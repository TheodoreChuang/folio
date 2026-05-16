import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger } from '@/db/schema'
import type { PropertyLedger, LedgerCategory } from '@/db/schema'
import { lastDayOfMonth } from '@/lib/format'

type CreateLedgerEntryInput = {
  userId: string
  propertyId: string
  lineItemDate: string
  amountCents: number
  category: LedgerCategory
  description: string | null
  sourceDocumentId?: string | null
  installmentLoanId?: string | null
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
      installmentLoanId: input.installmentLoanId ?? null,
      lineItemDate: input.lineItemDate,
      amountCents: input.amountCents,
      category: input.category,
      description: input.description,
    })
    .returning()
  return row
}

export async function upsertLoanPaymentEntry(
  userId: string,
  propertyId: string,
  installmentLoanId: string,
  lineItemDate: string,
  amountCents: number,
  description: string,
): Promise<PropertyLedger> {
  const month = lineItemDate.slice(0, 7)
  const startDate = `${month}-01`
  const endDate = lastDayOfMonth(month)

  let inserted!: PropertyLedger
  await db.transaction(async (tx) => {
    await tx
      .update(propertyLedger)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(propertyLedger.userId, userId),
          eq(propertyLedger.propertyId, propertyId),
          eq(propertyLedger.category, 'loan_payment'),
          eq(propertyLedger.installmentLoanId, installmentLoanId),
          gte(propertyLedger.lineItemDate, startDate),
          lte(propertyLedger.lineItemDate, endDate),
          isNull(propertyLedger.deletedAt),
        ),
      )

    const [row] = await tx
      .insert(propertyLedger)
      .values({
        userId,
        propertyId,
        installmentLoanId,
        lineItemDate,
        amountCents,
        category: 'loan_payment',
        description,
      })
      .returning()
    inserted = row
  })
  return inserted
}
