import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoanBalances } from '@/db/schema'
import type { InstallmentLoanBalance } from '@/db/schema'

type CreateInstallmentLoanBalanceInput = {
  recordedAt: string
  balanceCents: number
  notes?: string | null
}

export async function listInstallmentLoanBalances(
  userId: string,
  loanId: string,
): Promise<InstallmentLoanBalance[]> {
  return db
    .select()
    .from(installmentLoanBalances)
    .where(and(
      eq(installmentLoanBalances.installmentLoanId, loanId),
      eq(installmentLoanBalances.userId, userId),
    ))
    .orderBy(desc(installmentLoanBalances.recordedAt))
}

export async function createInstallmentLoanBalance(
  userId: string,
  loanId: string,
  input: CreateInstallmentLoanBalanceInput,
): Promise<InstallmentLoanBalance> {
  const [row] = await db
    .insert(installmentLoanBalances)
    .values({ userId, installmentLoanId: loanId, ...input })
    .returning()
  return row
}

export async function deleteInstallmentLoanBalance(
  userId: string,
  loanId: string,
  balanceId: string,
): Promise<InstallmentLoanBalance | undefined> {
  const [row] = await db
    .delete(installmentLoanBalances)
    .where(and(
      eq(installmentLoanBalances.id, balanceId),
      eq(installmentLoanBalances.installmentLoanId, loanId),
      eq(installmentLoanBalances.userId, userId),
    ))
    .returning()
  return row
}
