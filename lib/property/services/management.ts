import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, propertyTenancies, propertyManagementAgents } from '@/db/schema'
import type { PropertyTenancy, PropertyManagementAgent } from '@/db/schema'
import { createTenancy, type CreateTenancyInput } from '@/lib/property/repositories/tenancies'
import {
  deactivateCurrentAgents,
  createManagementAgent,
  type CreateManagementAgentInput,
} from '@/lib/property/repositories/management-agents'

async function assertPropertyOwnership(userId: string, propertyId: string): Promise<void> {
  const [prop] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1)
  if (!prop) throw new Error('Property not found')
}

export async function addTenancy(
  userId: string,
  propertyId: string,
  data: Omit<CreateTenancyInput, 'userId' | 'propertyId'>,
): Promise<PropertyTenancy> {
  await assertPropertyOwnership(userId, propertyId)
  return createTenancy({ userId, propertyId, ...data })
}

export async function renewTenancy(
  userId: string,
  propertyId: string,
  tenancyIdToEnd: string,
  data: Omit<CreateTenancyInput, 'userId' | 'propertyId'>,
): Promise<PropertyTenancy> {
  await assertPropertyOwnership(userId, propertyId)
  return db.transaction(async (tx) => {
    const [ended] = await tx
      .update(propertyTenancies)
      .set({ isCurrent: false })
      .where(
        and(
          eq(propertyTenancies.id, tenancyIdToEnd),
          eq(propertyTenancies.userId, userId),
          eq(propertyTenancies.propertyId, propertyId),
          isNull(propertyTenancies.deletedAt),
        ),
      )
      .returning()
    if (!ended) throw new Error('Tenancy not found')
    return createTenancy({ userId, propertyId, ...data }, tx)
  })
}

export async function setCurrentManagementAgent(
  userId: string,
  propertyId: string,
  data: Omit<CreateManagementAgentInput, 'userId' | 'propertyId'>,
): Promise<PropertyManagementAgent> {
  await assertPropertyOwnership(userId, propertyId)
  return db.transaction(async (tx) => {
    await deactivateCurrentAgents(tx, userId, propertyId)
    return createManagementAgent(tx, { userId, propertyId, ...data })
  })
}

export async function softDeleteManagementAgent(
  userId: string,
  propertyId: string,
  agentId: string,
): Promise<void> {
  await assertPropertyOwnership(userId, propertyId)
  await db.transaction(async (tx) => {
    await tx
      .update(propertyManagementAgents)
      .set({ deletedAt: new Date(), isCurrent: false })
      .where(
        and(
          eq(propertyManagementAgents.id, agentId),
          eq(propertyManagementAgents.userId, userId),
          eq(propertyManagementAgents.propertyId, propertyId),
          isNull(propertyManagementAgents.deletedAt),
        ),
      )

    // Only promote when the deleted agent was the current one
    const [stillCurrent] = await tx
      .select({ id: propertyManagementAgents.id })
      .from(propertyManagementAgents)
      .where(
        and(
          eq(propertyManagementAgents.userId, userId),
          eq(propertyManagementAgents.propertyId, propertyId),
          eq(propertyManagementAgents.isCurrent, true),
          isNull(propertyManagementAgents.deletedAt),
        ),
      )
      .limit(1)

    if (!stillCurrent) {
      const [candidate] = await tx
        .select({ id: propertyManagementAgents.id })
        .from(propertyManagementAgents)
        .where(
          and(
            eq(propertyManagementAgents.userId, userId),
            eq(propertyManagementAgents.propertyId, propertyId),
            isNull(propertyManagementAgents.deletedAt),
          ),
        )
        .orderBy(desc(propertyManagementAgents.createdAt))
        .limit(1)

      if (candidate) {
        await tx
          .update(propertyManagementAgents)
          .set({ isCurrent: true })
          .where(eq(propertyManagementAgents.id, candidate.id))
      }
    }
  })
}
