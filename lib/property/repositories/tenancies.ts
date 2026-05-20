import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, type DrizzleTx } from '@/lib/db'
import { propertyTenancies } from '@/db/schema'
import type { PropertyTenancy, LeaseType } from '@/db/schema'

export type CreateTenancyInput = {
  userId: string
  propertyId: string
  tenants?: string | null
  leaseType: LeaseType
  leaseStart: string
  leaseEnd?: string | null
  weeklyRentCents: number
  bondCents?: number | null
}

export async function listTenancies(userId: string, propertyId: string): Promise<PropertyTenancy[]> {
  return db
    .select()
    .from(propertyTenancies)
    .where(
      and(
        eq(propertyTenancies.userId, userId),
        eq(propertyTenancies.propertyId, propertyId),
        isNull(propertyTenancies.deletedAt),
      ),
    )
    .orderBy(desc(propertyTenancies.isCurrent), desc(propertyTenancies.createdAt))
}

export async function createTenancy(input: CreateTenancyInput, tx?: DrizzleTx): Promise<PropertyTenancy> {
  const client = tx ?? db
  const [row] = await client
    .insert(propertyTenancies)
    .values({
      userId: input.userId,
      propertyId: input.propertyId,
      tenants: input.tenants ?? null,
      leaseType: input.leaseType,
      leaseStart: input.leaseStart,
      leaseEnd: input.leaseEnd ?? null,
      weeklyRentCents: input.weeklyRentCents,
      bondCents: input.bondCents ?? null,
      isCurrent: true,
    })
    .returning()
  return row
}

export async function endTenancy(userId: string, tenancyId: string): Promise<PropertyTenancy | undefined> {
  const [row] = await db
    .update(propertyTenancies)
    .set({ isCurrent: false })
    .where(
      and(
        eq(propertyTenancies.id, tenancyId),
        eq(propertyTenancies.userId, userId),
        isNull(propertyTenancies.deletedAt),
      ),
    )
    .returning()
  return row
}

export async function softDeleteTenancy(userId: string, tenancyId: string): Promise<PropertyTenancy | undefined> {
  const [row] = await db
    .update(propertyTenancies)
    .set({ deletedAt: new Date(), isCurrent: false })
    .where(
      and(
        eq(propertyTenancies.id, tenancyId),
        eq(propertyTenancies.userId, userId),
        isNull(propertyTenancies.deletedAt),
      ),
    )
    .returning()
  return row
}
