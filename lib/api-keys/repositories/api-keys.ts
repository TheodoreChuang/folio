import { and, count, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiKeys } from '@/db/schema'
import type { ApiKey } from '@/db/schema'

export async function findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1)
  return row ?? null
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
}

export async function createApiKey(
  userId: string,
  name: string,
  keyHash: string,
  keyPrefix: string,
): Promise<ApiKey> {
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name, keyHash, keyPrefix })
    .returning()
  return row
}

export async function revokeApiKey(id: string, userId: string): Promise<boolean> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  return !!row
}

export async function countActiveApiKeys(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
  return row?.count ?? 0
}

export async function touchLastUsed(id: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, id))
    .returning({ id: apiKeys.id })
}
