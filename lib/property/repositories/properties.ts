import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import type { Property } from '@/db/schema'

type CreatePropertyInput = {
  userId: string
  address: string
  nickname: string | null
  startDate: string
  endDate: string | null
  entityId: string | null
}

type UpdatePropertyInput = {
  address?: string
  nickname?: string | null
  startDate?: string
  endDate?: string | null
  entityId?: string | null
}

export async function listProperties(userId: string): Promise<Property[]> {
  return db.select().from(properties).where(eq(properties.userId, userId))
}

export async function findPropertyById(userId: string, id: string): Promise<Property | undefined> {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1)
  return row
}

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  const [row] = await db.insert(properties).values(input).returning()
  return row
}

export async function updateProperty(
  userId: string,
  id: string,
  updates: UpdatePropertyInput,
): Promise<Property | undefined> {
  const [row] = await db
    .update(properties)
    .set(updates)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .returning()
  return row
}

export async function deleteProperty(userId: string, id: string): Promise<Property | undefined> {
  const [row] = await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .returning()
  return row
}
