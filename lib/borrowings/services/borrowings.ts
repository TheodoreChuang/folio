import { findInstallmentLoanById } from '../repositories/loans'
import type { InstallmentLoan } from '@/db/schema'

export async function validateLoanOwnership(
  userId: string,
  propertyId: string,
  loanId: string,
): Promise<InstallmentLoan | null> {
  const loan = await findInstallmentLoanById(userId, loanId)
  if (!loan || loan.propertyId !== propertyId) return null
  return loan
}
