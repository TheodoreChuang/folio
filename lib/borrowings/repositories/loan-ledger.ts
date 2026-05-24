import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loanLedger, sourceDocuments } from '@/db/schema'
import type { LoanLedger } from '@/db/schema'

type CreateLoanLedgerEntryInput = {
  paymentDate:    string
  amountCents:    number
  interestCents?: number | null
  principalCents?: number | null
  description?:   string | null
}

export type LoanLedgerWithSource = LoanLedger & { sourceFileName: string | null }

export async function listLoanLedgerEntries(
  userId: string,
  installmentLoanId: string,
): Promise<LoanLedgerWithSource[]> {
  return db
    .select({
      id:                loanLedger.id,
      userId:            loanLedger.userId,
      installmentLoanId: loanLedger.installmentLoanId,
      paymentDate:       loanLedger.paymentDate,
      amountCents:       loanLedger.amountCents,
      interestCents:     loanLedger.interestCents,
      principalCents:    loanLedger.principalCents,
      description:       loanLedger.description,
      sourceDocumentId:  loanLedger.sourceDocumentId,
      deletedAt:         loanLedger.deletedAt,
      createdAt:         loanLedger.createdAt,
      sourceFileName:    sourceDocuments.fileName,
    })
    .from(loanLedger)
    .leftJoin(sourceDocuments, eq(loanLedger.sourceDocumentId, sourceDocuments.id))
    .where(and(
      eq(loanLedger.userId, userId),
      eq(loanLedger.installmentLoanId, installmentLoanId),
      isNull(loanLedger.deletedAt),
    ))
    .orderBy(desc(loanLedger.paymentDate), desc(loanLedger.createdAt))
}

export async function createLoanLedgerEntry(
  userId: string,
  installmentLoanId: string,
  input: CreateLoanLedgerEntryInput,
): Promise<LoanLedger> {
  const [row] = await db
    .insert(loanLedger)
    .values({
      userId,
      installmentLoanId,
      paymentDate:    input.paymentDate,
      amountCents:    input.amountCents,
      interestCents:  input.interestCents ?? null,
      principalCents: input.principalCents ?? null,
      description:    input.description ?? null,
    })
    .returning()
  if (!row) throw new Error('insert returned no row')
  return row
}
