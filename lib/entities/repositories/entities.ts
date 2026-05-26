import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { entities } from '@/db/schema'
import type { Entity } from '@/db/schema'

export async function findEntityById(userId: string, entityId: string): Promise<Entity | undefined> {
  const [row] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, userId)))
    .limit(1)
  return row
}
