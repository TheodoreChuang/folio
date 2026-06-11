import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, propertyLedger, propertyValuations } from '@/db/schema'

export async function getReturnData(
  userId: string,
  fromDate: string,
  toDate: string,
  entityId?: string | null,
): Promise<{
  endValuations: Array<{ valueCents: number }>
  startValuations: Array<{ valueCents: number }>
  periodRentCents: number
}> {
  let propertyIds: string[] | undefined

  if (entityId) {
    const rows = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.userId, userId), eq(properties.entityId, entityId)))
    if (rows.length === 0) {
      return { endValuations: [], startValuations: [], periodRentCents: 0 }
    }
    propertyIds = rows.map(r => r.id)
  }

  const userFilter = eq(propertyValuations.userId, userId)
  const propFilter = propertyIds
    ? inArray(propertyValuations.propertyId, propertyIds)
    : undefined

  const endValuationsQuery = db
    .selectDistinctOn([propertyValuations.propertyId], {
      propertyId: propertyValuations.propertyId,
      valueCents: propertyValuations.valueCents,
    })
    .from(propertyValuations)
    .where(and(userFilter, lte(propertyValuations.valuedAt, toDate), propFilter))
    .orderBy(propertyValuations.propertyId, desc(propertyValuations.valuedAt))

  const startValuationsQuery = db
    .selectDistinctOn([propertyValuations.propertyId], {
      propertyId: propertyValuations.propertyId,
      valueCents: propertyValuations.valueCents,
    })
    .from(propertyValuations)
    .where(and(userFilter, lte(propertyValuations.valuedAt, fromDate), propFilter))
    .orderBy(propertyValuations.propertyId, desc(propertyValuations.valuedAt))

  const rentQuery = db
    .select({
      total: sql<number>`COALESCE(SUM(${propertyLedger.amountCents}), 0)::int`,
    })
    .from(propertyLedger)
    .where(
      and(
        eq(propertyLedger.userId, userId),
        eq(propertyLedger.category, 'rent'),
        gte(propertyLedger.lineItemDate, fromDate),
        lte(propertyLedger.lineItemDate, toDate),
        isNull(propertyLedger.deletedAt),
        propertyIds ? inArray(propertyLedger.propertyId, propertyIds) : undefined,
      ),
    )

  const [endValuations, startValuations, rentRows] = await Promise.all([
    endValuationsQuery,
    startValuationsQuery,
    rentQuery,
  ])

  return {
    endValuations,
    startValuations,
    periodRentCents: rentRows[0]?.total ?? 0,
  }
}
