import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personalBudgetItems } from '@/db/schema'
import type { PersonalBudgetItem, BudgetItemType, BudgetItemFrequency } from '@/db/schema'

export type CreateBudgetItemInput = {
  userId: string
  type: BudgetItemType
  name: string
  amountCents: number
  frequency: BudgetItemFrequency
  effectiveFrom?: string
  detail?: string
}

export type UpdateBudgetItemData = {
  name?: string
  amountCents?: number
  frequency?: BudgetItemFrequency
  detail?: string
}

export async function listBudgetItems(userId: string): Promise<PersonalBudgetItem[]> {
  return db
    .select()
    .from(personalBudgetItems)
    .where(
      and(
        eq(personalBudgetItems.userId, userId),
        isNull(personalBudgetItems.deletedAt),
      ),
    )
    .orderBy(
      // income rows before expense rows ('expense' < 'income' alphabetically, so CASE needed)
      sql`CASE WHEN ${personalBudgetItems.type} = 'income' THEN 0 ELSE 1 END`,
      asc(personalBudgetItems.createdAt),
    )
}

export async function createBudgetItem(input: CreateBudgetItemInput): Promise<PersonalBudgetItem> {
  const [row] = await db
    .insert(personalBudgetItems)
    .values({
      userId: input.userId,
      type: input.type,
      name: input.name,
      amountCents: input.amountCents,
      frequency: input.frequency,
      effectiveFrom: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      detail: input.detail,
    })
    .returning()
  return row
}

export async function updateBudgetItem(
  userId: string,
  id: string,
  data: UpdateBudgetItemData,
): Promise<PersonalBudgetItem | undefined> {
  const [row] = await db
    .update(personalBudgetItems)
    .set(data)
    .where(
      and(
        eq(personalBudgetItems.id, id),
        eq(personalBudgetItems.userId, userId),
        isNull(personalBudgetItems.deletedAt),
      ),
    )
    .returning()
  return row
}

export async function softDeleteBudgetItem(
  userId: string,
  id: string,
): Promise<PersonalBudgetItem | undefined> {
  const [row] = await db
    .update(personalBudgetItems)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(personalBudgetItems.id, id),
        eq(personalBudgetItems.userId, userId),
        isNull(personalBudgetItems.deletedAt),
      ),
    )
    .returning()
  return row
}

export async function findBudgetItemById(
  userId: string,
  id: string,
): Promise<PersonalBudgetItem | undefined> {
  const [row] = await db
    .select()
    .from(personalBudgetItems)
    .where(
      and(
        eq(personalBudgetItems.id, id),
        eq(personalBudgetItems.userId, userId),
        isNull(personalBudgetItems.deletedAt),
      ),
    )
    .limit(1)
  return row
}
