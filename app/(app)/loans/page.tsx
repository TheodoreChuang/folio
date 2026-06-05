'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MetricTile } from '@/components/ui/metric-tile'
import type { Entity } from '@/db/schema'
import type { FlatInstallmentLoan } from '@/lib/borrowings'
import { formatCents } from '@/lib/format'
import { pmt, interestOnlyPayment } from '@/lib/aggregate/plan/calculators/rate-sensitivity'

function estimateRepaymentCents(loan: FlatInstallmentLoan): number | null {
  const balance = loan.latestBalance?.balanceCents
  const ratePct = loan.interestRate != null ? parseFloat(loan.interestRate) : null
  if (!balance || ratePct == null || isNaN(ratePct)) return null
  if (loan.loanType === 'interest_only' || loan.loanType === 'line_of_credit') {
    return interestOnlyPayment(ratePct, balance)
  }
  if (loan.loanType === 'principal_and_interest') {
    if (!loan.loanTermYears) return null
    return pmt(ratePct, loan.loanTermYears * 12, balance)
  }
  return null
}

function loanTypeLabel(loanType: string | null): string {
  if (loanType === 'interest_only') return 'IO'
  if (loanType === 'principal_and_interest') return 'P&I'
  if (loanType === 'line_of_credit') return 'LOC'
  return loanType ?? '—'
}

type FlatLoan = FlatInstallmentLoan

export default function LoansPage() {
  const router = useRouter()
  const [loans, setLoans] = useState<FlatLoan[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState<string | null>(null)

  const loadLoans = useCallback(async () => {
    setLoading(true)
    try {
      const [loansRes, entitiesRes] = await Promise.all([
        fetch('/api/loans'),
        fetch('/api/entities'),
      ])

      if (loansRes.status === 401 || entitiesRes.status === 401) {
        router.push('/login')
        return
      }

      const loansData = await loansRes.json() as { loans?: FlatLoan[] }
      const entitiesData = await entitiesRes.json() as { entities?: Entity[] }

      setLoans(loansData.loans ?? [])
      setEntities(entitiesData.entities ?? [])
    } catch {
      toast.error('Failed to load loans')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadLoans()
  }, [loadLoans])

  const filteredLoans = entityFilter
    ? loans.filter(l => l.entityId === entityFilter)
    : loans

  const totalDebtCents = filteredLoans.reduce((sum, l) => sum + (l.latestBalance?.balanceCents ?? 0), 0)
  const securedPropertyIds = new Set(filteredLoans.map(l => l.propertyId).filter(Boolean))

  const monthlyRepaymentsCents = (() => {
    const amounts = filteredLoans.map(estimateRepaymentCents).filter((v): v is number => v !== null)
    return amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) : null
  })()

  const weightedAvgRate = (() => {
    let weightedSum = 0, totalBalance = 0
    for (const l of filteredLoans) {
      const bal = l.latestBalance?.balanceCents
      const rate = l.interestRate != null ? parseFloat(l.interestRate) : null
      if (bal && rate != null && !isNaN(rate)) { weightedSum += bal * rate; totalBalance += bal }
    }
    return totalBalance > 0 ? weightedSum / totalBalance : null
  })()

  const entityChips = entities.filter(e => loans.some(l => l.entityId === e.id))

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-foreground">Loans</h1>
            <p className="text-sm text-foreground-muted mt-0.5">All borrowings across the portfolio</p>
          </div>
          <Link href="/loans/new">
            <Button size="sm">+ Add loan</Button>
          </Link>
        </div>

        {entityChips.length > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Filter</span>
            {entityChips.map(e => (
              <button
                key={e.id}
                onClick={() => setEntityFilter(prev => prev === e.id ? null : e.id)}
                className={[
                  'flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-medium transition-colors',
                  entityFilter === e.id
                    ? 'bg-accent-soft border-accent/20 text-accent'
                    : 'bg-surface border-border text-foreground-muted hover:text-foreground hover:border-foreground/20',
                ].join(' ')}
              >
                <span className="text-[10px] font-medium opacity-60">Entity</span>
                {e.name}
                {entityFilter === e.id && (
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.4" />
                    <line x1="2" y1="8" x2="8" y2="2" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-6">
          <MetricTile
            label="Total debt"
            value={loading ? '…' : formatCents(totalDebtCents)}
            foot={<span>{filteredLoans.length} loan{filteredLoans.length !== 1 ? 's' : ''}</span>}
          />
          <MetricTile
            label="Monthly repayments (est)"
            value={loading ? '…' : monthlyRepaymentsCents !== null ? formatCents(monthlyRepaymentsCents) : '—'}
            foot={monthlyRepaymentsCents !== null ? (
              <span>{formatCents(monthlyRepaymentsCents * 12)} / yr</span>
            ) : undefined}
          />
          <MetricTile
            label="Weighted avg rate"
            value={loading ? '…' : weightedAvgRate !== null ? `${weightedAvgRate.toFixed(2)}%` : '—'}
          />
          <MetricTile
            label="Properties secured"
            value={loading ? '…' : String(securedPropertyIds.size)}
          />
        </div>

        <div>
          <div className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-2">
            All loans
          </div>

          {loading ? (
            <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-foreground-muted">
              Loading loans…
            </div>
          ) : filteredLoans.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-foreground-muted">
              {loans.length === 0 ? 'No loans yet. Add one with the button above.' : 'No loans match the current filter.'}
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background">
                      <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Lender</th>
                      <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Nickname / Account</th>
                      <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Entity</th>
                      <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Security</th>
                      <th className="text-right font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Balance</th>
                      <th className="text-right font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Rate</th>
                      <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Type</th>
                      <th className="text-right font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Repayment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.map(loan => (
                      <tr
                        key={loan.id}
                        onClick={() => router.push(`/loans/${loan.id}`)}
                        className="border-b border-rule last:border-b-0 hover:bg-background cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{loan.lender}</td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{loan.nickname ?? '—'}</div>
                          {loan.accountReference && (
                            <div className="text-xs text-foreground-muted mt-0.5">acct ending {loan.accountReference.slice(-4)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground-muted">{loan.entityName ?? '—'}</td>
                        <td className="px-4 py-3 text-foreground-muted">{loan.propertyAddress ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {loan.latestBalance ? formatCents(loan.latestBalance.balanceCents) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                          {loan.interestRate != null ? `${loan.interestRate}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground-muted">{loanTypeLabel(loan.loanType)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground-muted">
                          {(() => {
                            const rep = estimateRepaymentCents(loan)
                            return rep !== null ? (
                              <>{formatCents(rep)} <span className="text-[10px] text-foreground-subtle">est</span></>
                            ) : '—'
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
