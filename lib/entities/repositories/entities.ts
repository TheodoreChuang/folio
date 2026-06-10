import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { entities } from '@/db/schema'
import type { Entity, EntityType } from '@/db/schema'

export async function findEntityById(userId: string, entityId: string): Promise<Entity | undefined> {
  const [row] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, userId)))
    .limit(1)
  return row
}

export async function listEntities(userId: string): Promise<Entity[]> {
  return db.select().from(entities).where(eq(entities.userId, userId))
}

export async function createEntity(userId: string, name: string, type: EntityType): Promise<Entity> {
  const [row] = await db.insert(entities).values({ userId, name, type }).returning()
  return row
}

export async function updateEntity(userId: string, id: string, name: string): Promise<Entity | undefined> {
  const [row] = await db
    .update(entities)
    .set({ name })
    .where(and(eq(entities.id, id), eq(entities.userId, userId)))
    .returning()
  return row
}

export async function deleteEntity(userId: string, id: string): Promise<Entity | undefined> {
  const [row] = await db
    .delete(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)))
    .returning()
  return row
}

