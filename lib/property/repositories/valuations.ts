import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyValuations } from '@/db/schema'
import type { PropertyValuation } from '@/db/schema'

type CreateValuationInput = {
  userId: string
  propertyId: string
  valuedAt: string
  valueCents: number
  source: string | null
  notes: string | null
}

export async function listValuations(userId: string, propertyId: string): Promise<PropertyValuation[]> {
  return db
    .select()
    .from(propertyValuations)
    .where(and(eq(propertyValuations.propertyId, propertyId), eq(propertyValuations.userId, userId)))
    .orderBy(desc(propertyValuations.valuedAt))
}

export async function findLatestValuation(
  userId: string,
  propertyId: string,
): Promise<PropertyValuation | undefined> {
  const [row] = await db
    .select()
    .from(propertyValuations)
    .where(and(eq(propertyValuations.propertyId, propertyId), eq(propertyValuations.userId, userId)))
    .orderBy(desc(propertyValuations.valuedAt))
    .limit(1)
  return row
}

export async function createValuation(input: CreateValuationInput): Promise<PropertyValuation> {
  const [row] = await db.insert(propertyValuations).values(input).returning()
  return row
}

export async function deleteValuation(
  userId: string,
  propertyId: string,
  valuationId: string,
): Promise<PropertyValuation | undefined> {
  const [row] = await db
    .delete(propertyValuations)
    .where(
      and(
        eq(propertyValuations.id, valuationId),
        eq(propertyValuations.propertyId, propertyId),
        eq(propertyValuations.userId, userId),
      ),
    )
    .returning()
  return row
}
