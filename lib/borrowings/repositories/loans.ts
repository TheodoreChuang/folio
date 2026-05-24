import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoans, installmentLoanBalances, properties } from '@/db/schema'
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
  loanType?: 'interest_only' | 'principal_and_interest' | null
  ioEndDate?: string | null
  interestRate?: string | null
}

type RecentBalance = { id: string; balanceCents: number; recordedAt: string }

export type LoanWithBalances = InstallmentLoan & {
  latestBalance: { balanceCents: number; recordedAt: string } | null
  recentBalances: RecentBalance[]
}

export async function listInstallmentLoans(
  userId: string,
  propertyId: string,
): Promise<LoanWithBalances[]> {
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
  const recentBalancesMap = new Map<string, RecentBalance[]>()
  for (const row of balanceRows) {
    if (!latestBalanceMap.has(row.installmentLoanId)) {
      latestBalanceMap.set(row.installmentLoanId, {
        balanceCents: row.balanceCents,
        recordedAt: row.recordedAt,
      })
    }
    const recent = recentBalancesMap.get(row.installmentLoanId) ?? []
    if (recent.length < 4) {
      recent.push({ id: row.id, balanceCents: row.balanceCents, recordedAt: row.recordedAt })
      recentBalancesMap.set(row.installmentLoanId, recent)
    }
  }

  return loans.map(loan => ({
    ...loan,
    latestBalance: latestBalanceMap.get(loan.id) ?? null,
    recentBalances: recentBalancesMap.get(loan.id) ?? [],
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

export type InstallmentLoanDetail = InstallmentLoan & {
  propertyAddress: string | null
  latestBalance: { balanceCents: number; recordedAt: string } | null
}

export async function findInstallmentLoanDetail(
  userId: string,
  loanId: string,
): Promise<InstallmentLoanDetail | undefined> {
  const [row] = await db
    .select({
      id:           installmentLoans.id,
      userId:       installmentLoans.userId,
      propertyId:   installmentLoans.propertyId,
      lender:       installmentLoans.lender,
      nickname:     installmentLoans.nickname,
      startDate:    installmentLoans.startDate,
      endDate:      installmentLoans.endDate,
      entityId:     installmentLoans.entityId,
      loanType:     installmentLoans.loanType,
      ioEndDate:    installmentLoans.ioEndDate,
      interestRate: installmentLoans.interestRate,
      createdAt:    installmentLoans.createdAt,
      propertyAddress: sql<string | null>`CASE
        WHEN ${properties.nickname} IS NOT NULL AND ${properties.nickname} != ''
          THEN ${properties.nickname}
        WHEN ${properties.address} IS NOT NULL
          THEN ${properties.address}
        ELSE NULL
      END`,
    })
    .from(installmentLoans)
    .leftJoin(properties, eq(installmentLoans.propertyId, properties.id))
    .where(and(
      eq(installmentLoans.id, loanId),
      eq(installmentLoans.userId, userId),
    ))
    .limit(1)

  if (!row) return undefined

  const [balRow] = await db
    .select({
      balanceCents: installmentLoanBalances.balanceCents,
      recordedAt:   installmentLoanBalances.recordedAt,
    })
    .from(installmentLoanBalances)
    .where(and(
      eq(installmentLoanBalances.installmentLoanId, loanId),
      eq(installmentLoanBalances.userId, userId),
    ))
    .orderBy(desc(installmentLoanBalances.recordedAt))
    .limit(1)

  return {
    ...row,
    latestBalance: balRow ?? null,
  }
}

export async function updateInstallmentLoanById(
  userId: string,
  loanId: string,
  updates: UpdateInstallmentLoanInput,
): Promise<InstallmentLoan | undefined> {
  const [row] = await db
    .update(installmentLoans)
    .set(updates)
    .where(and(
      eq(installmentLoans.id, loanId),
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
