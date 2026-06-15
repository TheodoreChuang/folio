import { tool } from 'ai'
import { z } from 'zod'
import { findInstallmentLoanDetail } from '@/lib/borrowings'

const inputSchema = z.object({
  loanId: z.string().describe('The ID of the loan to look up.'),
})

export function buildLoanTool(userId: string) {
  return tool({
    description: 'Get detailed information about a specific loan including balance, interest rate, and loan type.',
    inputSchema,
    execute: async ({ loanId }) => {
      try {
        const loan = await findInstallmentLoanDetail(userId, loanId)
        if (!loan) {
          return {
            found: false,
            source: 'Loan lookup',
            statusLabel: 'Querying your loans…',
          }
        }
        // Strip accountReference — sensitive field, not for model output
        const { accountReference, ...safeFields } = loan
        void accountReference
        return {
          found: true,
          loan: safeFields,
          source: `Loan: ${loan.lender}`,
          statusLabel: 'Querying your loans…',
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Unknown error',
          source: 'Loan lookup',
          statusLabel: 'Querying your loans…',
        }
      }
    },
  })
}
