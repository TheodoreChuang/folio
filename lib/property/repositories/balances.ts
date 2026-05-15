import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loanBalances } from '@/db/schema'
import type { LoanBalance } from '@/db/schema'

type CreateBalanceInput = {
  userId: string
  loanAccountId: string
  recordedAt: string
  balanceCents: number
  notes: string | null
}

export async function listBalances(userId: string, loanAccountId: string): Promise<LoanBalance[]> {
  return db
    .select()
    .from(loanBalances)
    .where(and(eq(loanBalances.loanAccountId, loanAccountId), eq(loanBalances.userId, userId)))
    .orderBy(desc(loanBalances.recordedAt))
}

export async function listLatestBalancesForUser(userId: string): Promise<LoanBalance[]> {
  return db
    .select()
    .from(loanBalances)
    .where(eq(loanBalances.userId, userId))
    .orderBy(loanBalances.loanAccountId, desc(loanBalances.recordedAt))
}

export async function createBalance(input: CreateBalanceInput): Promise<LoanBalance> {
  const [row] = await db.insert(loanBalances).values(input).returning()
  return row
}

export async function deleteBalance(
  userId: string,
  loanAccountId: string,
  balanceId: string,
): Promise<LoanBalance | undefined> {
  const [row] = await db
    .delete(loanBalances)
    .where(
      and(
        eq(loanBalances.id, balanceId),
        eq(loanBalances.loanAccountId, loanAccountId),
        eq(loanBalances.userId, userId),
      ),
    )
    .returning()
  return row
}
