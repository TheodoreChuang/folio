import { tool } from 'ai'
import { z } from 'zod'
import { listLedgerEntriesInRange } from '@/lib/aggregate'

const inputSchema = z.object({
  from: z.string().describe('Start date in YYYY-MM-DD format.'),
  to: z.string().describe('End date in YYYY-MM-DD format.'),
  category: z.string().optional().describe('Filter entries to a specific category (e.g. rent, insurance, loan_payment).'),
  propertyId: z.string().optional().describe('Filter entries to a specific property by ID.'),
})

export function buildLedgerTool(userId: string) {
  return tool({
    description: 'Look up individual ledger entries for a date range, optionally filtered by category or property.',
    inputSchema,
    execute: async ({ from, to, category, propertyId }) => {
      try {
        const propertyIds = propertyId ? [propertyId] : undefined
        let entries = await listLedgerEntriesInRange(userId, from, to, propertyIds)
        if (category) {
          entries = entries.filter(e => e.category === category)
        }
        return {
          entries,
          count: entries.length,
          source: `Ledger entries ${from} to ${to}`,
          statusLabel: 'Searching your ledger…',
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Unknown error',
          source: `Ledger entries ${from} to ${to}`,
          statusLabel: 'Searching your ledger…',
        }
      }
    },
  })
}
