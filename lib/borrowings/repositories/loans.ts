import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { installmentLoans, installmentLoanBalances, properties, entities } from '@/db/schema'
import type { InstallmentLoan, LoanType } from '@/db/schema'

type CreateInstallmentLoanInput = {
  lender: string
  nickname?: string | null
  accountReference?: string | null
  propertyId?: string | null
  startDate?: string | null
  endDate?: string | null
  entityId?: string | null
  loanType?: 'interest_only' | 'principal_and_interest' | 'line_of_credit' | null
  ioEndDate?: string | null
  interestRate?: string | null
  rateType?: 'variable' | 'fixed' | null
  loanTermYears?: number | null
  originalAmountCents?: number | null
}

type UpdateInstallmentLoanInput = {
  lender?: string
  nickname?: string | null
  accountReference?: string | null
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

export async function listAllInstallmentLoans(
  userId: string,
): Promise<Pick<InstallmentLoan, 'id' | 'lender' | 'nickname'>[]> {
  return db
    .select({ id: installmentLoans.id, lender: installmentLoans.lender, nickname: installmentLoans.nickname })
    .from(installmentLoans)
    .where(eq(installmentLoans.userId, userId))
}

export type FlatInstallmentLoan = InstallmentLoan & {
  latestBalance: { balanceCents: number; recordedAt: string } | null
  propertyAddress: string | null
  entityName: string | null
}

type LoanFilters = {
  entityId?: string | null
  lender?: string | null
  loanType?: LoanType | null
}

export async function listAllLoansFlat(userId: string, filters?: LoanFilters): Promise<FlatInstallmentLoan[]> {
  const [loans, propRows, entityRows, balanceRows] = await Promise.all([
    db.select().from(installmentLoans).where(and(
      eq(installmentLoans.userId, userId),
      filters?.entityId ? eq(installmentLoans.entityId, filters.entityId) : undefined,
      filters?.lender ? eq(installmentLoans.lender, filters.lender) : undefined,
      filters?.loanType ? eq(installmentLoans.loanType, filters.loanType) : undefined,
    )),
    db.select({ id: properties.id, address: properties.address, nickname: properties.nickname })
      .from(properties).where(eq(properties.userId, userId)),
    db.select({ id: entities.id, name: entities.name })
      .from(entities).where(eq(entities.userId, userId)),
    db.select().from(installmentLoanBalances)
      .where(eq(installmentLoanBalances.userId, userId))
      .orderBy(installmentLoanBalances.installmentLoanId, desc(installmentLoanBalances.recordedAt)),
  ])

  const propertyMap = new Map(propRows.map(p => [p.id, p.nickname ?? p.address]))
  const entityMap = new Map(entityRows.map(e => [e.id, e.name]))
  const latestBalanceMap = new Map<string, { balanceCents: number; recordedAt: string }>()
  for (const row of balanceRows) {
    if (!latestBalanceMap.has(row.installmentLoanId)) {
      latestBalanceMap.set(row.installmentLoanId, { balanceCents: row.balanceCents, recordedAt: row.recordedAt })
    }
  }

  return loans.map(loan => ({
    ...loan,
    latestBalance: latestBalanceMap.get(loan.id) ?? null,
    propertyAddress: loan.propertyId ? (propertyMap.get(loan.propertyId) ?? null) : null,
    entityName: loan.entityId ? (entityMap.get(loan.entityId) ?? null) : null,
  }))
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
  input: CreateInstallmentLoanInput,
): Promise<InstallmentLoan> {
  const [row] = await db.insert(installmentLoans).values({ userId, ...input }).returning()
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
  entityName: string | null
  latestBalance: { balanceCents: number; recordedAt: string } | null
}

export async function findInstallmentLoanDetail(
  userId: string,
  loanId: string,
): Promise<InstallmentLoanDetail | undefined> {
  const [row] = await db
    .select({
      id:                  installmentLoans.id,
      userId:              installmentLoans.userId,
      propertyId:          installmentLoans.propertyId,
      lender:              installmentLoans.lender,
      nickname:            installmentLoans.nickname,
      accountReference:    installmentLoans.accountReference,
      startDate:           installmentLoans.startDate,
      endDate:             installmentLoans.endDate,
      entityId:            installmentLoans.entityId,
      loanType:            installmentLoans.loanType,
      ioEndDate:           installmentLoans.ioEndDate,
      interestRate:        installmentLoans.interestRate,
      rateType:            installmentLoans.rateType,
      loanTermYears:       installmentLoans.loanTermYears,
      originalAmountCents: installmentLoans.originalAmountCents,
      createdAt:           installmentLoans.createdAt,
      propertyAddress: sql<string | null>`CASE
        WHEN ${properties.nickname} IS NOT NULL AND ${properties.nickname} != ''
          THEN ${properties.nickname}
        WHEN ${properties.address} IS NOT NULL
          THEN ${properties.address}
        ELSE NULL
      END`,
      entityName: entities.name,
    })
    .from(installmentLoans)
    .leftJoin(properties, eq(installmentLoans.propertyId, properties.id))
    .leftJoin(entities, eq(installmentLoans.entityId, entities.id))
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
