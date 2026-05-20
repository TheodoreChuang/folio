import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyManagementAgents } from '@/db/schema'
import type { PropertyManagementAgent, StatementCadence } from '@/db/schema'

export type CreateManagementAgentInput = {
  userId: string
  propertyId: string
  agencyName: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  feePercent?: string | null
  statementCadence: StatementCadence
  effectiveFrom: string
  effectiveTo?: string | null
}

export async function listManagementAgents(
  userId: string,
  propertyId: string,
): Promise<PropertyManagementAgent[]> {
  return db
    .select()
    .from(propertyManagementAgents)
    .where(
      and(
        eq(propertyManagementAgents.userId, userId),
        eq(propertyManagementAgents.propertyId, propertyId),
        isNull(propertyManagementAgents.deletedAt),
      ),
    )
    .orderBy(desc(propertyManagementAgents.isCurrent), desc(propertyManagementAgents.createdAt))
}

export async function findCurrentAgent(
  userId: string,
  propertyId: string,
): Promise<PropertyManagementAgent | undefined> {
  const [row] = await db
    .select()
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
  return row
}

export async function deactivateCurrentAgents(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  propertyId: string,
): Promise<void> {
  await tx
    .update(propertyManagementAgents)
    .set({ isCurrent: false })
    .where(
      and(
        eq(propertyManagementAgents.userId, userId),
        eq(propertyManagementAgents.propertyId, propertyId),
        eq(propertyManagementAgents.isCurrent, true),
        isNull(propertyManagementAgents.deletedAt),
      ),
    )
}

