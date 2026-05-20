import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import type { PropertyTenancy, PropertyManagementAgent } from '@/db/schema'
import {
  createTenancy,
  updateTenancy,
  deleteTenancy,
  type CreateTenancyInput,
  type UpdateTenancyInput,
} from '@/lib/property/repositories/tenancies'
import {
  createManagementAgent,
  updateManagementAgent,
  deleteManagementAgent,
  type CreateManagementAgentInput,
  type UpdateManagementAgentInput,
} from '@/lib/property/repositories/management-agents'

async function assertPropertyOwnership(userId: string, propertyId: string): Promise<void> {
  const [prop] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1)
  if (!prop) throw new Error('Property not found')
}

// Tenancies

export async function addTenancy(
  userId: string,
  propertyId: string,
  data: Omit<CreateTenancyInput, 'userId' | 'propertyId'>,
): Promise<PropertyTenancy> {
  await assertPropertyOwnership(userId, propertyId)
  return createTenancy({ userId, propertyId, ...data })
}

export async function editTenancy(
  userId: string,
  tenancyId: string,
  data: UpdateTenancyInput,
): Promise<PropertyTenancy | undefined> {
  return updateTenancy(userId, tenancyId, data)
}

export async function removeTenancy(
  userId: string,
  tenancyId: string,
): Promise<PropertyTenancy | undefined> {
  return deleteTenancy(userId, tenancyId)
}

// Management agents

export async function addManagementAgent(
  userId: string,
  propertyId: string,
  data: Omit<CreateManagementAgentInput, 'userId' | 'propertyId'>,
): Promise<PropertyManagementAgent> {
  await assertPropertyOwnership(userId, propertyId)
  return createManagementAgent({ userId, propertyId, ...data })
}

export async function editManagementAgent(
  userId: string,
  agentId: string,
  data: UpdateManagementAgentInput,
): Promise<PropertyManagementAgent | undefined> {
  return updateManagementAgent(userId, agentId, data)
}

export async function removeManagementAgent(
  userId: string,
  agentId: string,
): Promise<PropertyManagementAgent | undefined> {
  return deleteManagementAgent(userId, agentId)
}
