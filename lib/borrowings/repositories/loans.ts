import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoans, installmentLoanBalances } from '@/db/schema'
import type { InstallmentLoan } from '@/db/schema'

type CreateInstallmentLoanInput = {
  lender: string
  nickname: string | null
  startDate: string
  endDate: string
  entityId?: string | null
}

type UpdateInstallmentLoanInput = {
  lender?: string
  nickname?: string | null
  startDate?: string
  endDate?: string
  entityId?: string | null
}

export async function listInstallmentLoans(
  userId: string,
  propertyId: string,
): Promise<Array<InstallmentLoan & { latestBalance: { balanceCents: number; recordedAt: string } | null }>> {
  const loans = await db
    .select()
    .from(installmentLoans)
    .where(and(eq(installmentLoans.propertyId, propertyId), eq(installmentLoans.userId, userId)))

  const balanceRows = await db
    .select()
    .from(installmentLoanBalances)
    .where(eq(installmentLoanBalances.userId, userId))
    .orderBy(installmentLoanBalances.installmentLoanId, desc(installmentLoanBalances.recordedAt))

  const latestBalanceMap = new Map<string, { balanceCents: number; recordedAt: string }>()
  for (const row of balanceRows) {
    if (!latestBalanceMap.has(row.installmentLoanId)) {
      latestBalanceMap.set(row.installmentLoanId, {
        balanceCents: row.balanceCents,
        recordedAt: row.recordedAt,
      })
    }
  }

  return loans.map(loan => ({
    ...loan,
    latestBalance: latestBalanceMap.get(loan.id) ?? null,
  }))
}

export async function findInstallmentLoanById(
  userId: string,
  loanId: string,
): Promise<InstallmentLoan | undefined> {
  const [row] = await db
    .select()
    .from(installmentLoans)
    .where(and(eq(installmentLoans.id, loanId), eq(installmentLoans.userId, userId)))
    .limit(1)
  return row
}

export async function createInstallmentLoan(
  userId: string,
  propertyId: string,
  input: CreateInstallmentLoanInput,
): Promise<InstallmentLoan> {
  const [row] = await db
    .insert(installmentLoans)
    .values({ userId, propertyId, ...input })
    .returning()
  return row
}

export async function updateInstallmentLoan(
  userId: string,
  propertyId: string,
  loanId: string,
  updates: UpdateInstallmentLoanInput,
): Promise<InstallmentLoan | undefined> {
  const [row] = await db
    .update(installmentLoans)
    .set(updates)
    .where(and(
      eq(installmentLoans.id, loanId),
      eq(installmentLoans.propertyId, propertyId),
      eq(installmentLoans.userId, userId),
    ))
    .returning()
  return row
}

export async function endInstallmentLoan(
  userId: string,
  propertyId: string,
  loanId: string,
): Promise<InstallmentLoan | undefined> {
  const today = new Date().toISOString().slice(0, 10)
  const [row] = await db
    .update(installmentLoans)
    .set({ endDate: today })
    .where(and(
      eq(installmentLoans.id, loanId),
      eq(installmentLoans.propertyId, propertyId),
      eq(installmentLoans.userId, userId),
    ))
    .returning()
  return row
}
