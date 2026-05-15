import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loanAccounts } from '@/db/schema'
import type { LoanAccount } from '@/db/schema'

type CreateLoanInput = {
  userId: string
  propertyId: string
  lender: string
  nickname: string | null
  startDate: string
  endDate: string
  entityId?: string | null
}

type UpdateLoanInput = {
  lender?: string
  nickname?: string | null
  startDate?: string
  endDate?: string
  entityId?: string | null
}

export async function listLoans(userId: string, propertyId: string): Promise<LoanAccount[]> {
  return db
    .select()
    .from(loanAccounts)
    .where(and(eq(loanAccounts.propertyId, propertyId), eq(loanAccounts.userId, userId)))
}

export async function findLoanById(
  userId: string,
  propertyId: string,
  loanId: string,
): Promise<LoanAccount | undefined> {
  const [row] = await db
    .select()
    .from(loanAccounts)
    .where(
      and(
        eq(loanAccounts.id, loanId),
        eq(loanAccounts.propertyId, propertyId),
        eq(loanAccounts.userId, userId),
      ),
    )
    .limit(1)
  return row
}

export async function createLoan(input: CreateLoanInput): Promise<LoanAccount> {
  const [row] = await db.insert(loanAccounts).values(input).returning()
  return row
}

export async function updateLoan(
  userId: string,
  propertyId: string,
  loanId: string,
  updates: UpdateLoanInput,
): Promise<LoanAccount | undefined> {
  const [row] = await db
    .update(loanAccounts)
    .set(updates)
    .where(
      and(
        eq(loanAccounts.id, loanId),
        eq(loanAccounts.propertyId, propertyId),
        eq(loanAccounts.userId, userId),
      ),
    )
    .returning()
  return row
}

export async function closeLoan(
  userId: string,
  propertyId: string,
  loanId: string,
): Promise<LoanAccount | undefined> {
  const today = new Date().toISOString().slice(0, 10)
  const [row] = await db
    .update(loanAccounts)
    .set({ endDate: today })
    .where(
      and(
        eq(loanAccounts.id, loanId),
        eq(loanAccounts.propertyId, propertyId),
        eq(loanAccounts.userId, userId),
      ),
    )
    .returning()
  return row
}
