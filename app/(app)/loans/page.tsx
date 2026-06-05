'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MetricTile } from '@/components/ui/metric-tile'
import { FilterChip } from '@/components/filter-chip'
import type { FilterOption } from '@/components/filter-chip'
import type { Entity, EntityType } from '@/db/schema'
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

function loanTypeFullLabel(loanType: string): string {
  if (loanType === 'interest_only') return 'Interest only'
  if (loanType === 'principal_and_interest') return 'Principal and interest'
  if (loanType === 'line_of_credit') return 'Line of credit'
  return loanType
}

function entityTypeSubLabel(type: EntityType): string {
  switch (type) {
    case 'trust': return 'Discretionary trust'
    case 'individual': return 'Individual'
    case 'company': return 'Company'
    case 'joint': return 'Joint'
    case 'superannuation': return 'Superannuation'
  }
}

type FlatLoan = FlatInstallmentLoan

export default function LoansPage() {
  const router = useRouter()
  const [loans, setLoans] = useState<FlatLoan[]>([])
  const [allLoans, setAllLoans] = useState<FlatLoan[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [lenderFilter, setLenderFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const loadLoans = useCallback(async (entityId: string | null, lender: string | null, loanType: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entityId) params.set('entityId', entityId)
      if (lender) params.set('lender', lender)
      if (loanType) params.set('loanType', loanType)
      const qs = params.size ? `?${params}` : ''
      const anyActive = !!(entityId || lender || loanType)

      const [loansRes, entRes, allLoansRes] = await Promise.all([
        fetch(`/api/loans${qs}`),
        fetch('/api/entities'),
        anyActive ? fetch('/api/loans') : Promise.resolve(null),
      ])

      if (loansRes.status === 401) { router.push('/login'); return }

      const { loans: list = [] } = await loansRes.json() as { loans?: FlatLoan[] }
      const { entities: ents = [] } = entRes.ok
        ? await entRes.json() as { entities?: Entity[] }
        : { entities: [] }

      setLoans(list)
      setEntities(ents)

      if (anyActive && allLoansRes) {
        const { loans: all = [] } = await allLoansRes.json() as { loans?: FlatLoan[] }
        setAllLoans(all)
      } else {
        setAllLoans(list)
      }
    } catch {
      toast.error('Failed to load loans')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadLoans(entityFilter, lenderFilter, typeFilter)
  }, [entityFilter, lenderFilter, typeFilter, loadLoans])

  const totalDebtCents = loans.reduce((sum, l) => sum + (l.latestBalance?.balanceCents ?? 0), 0)
  const securedPropertyIds = new Set(loans.map(l => l.propertyId).filter(Boolean))

  const monthlyRepaymentsCents = (() => {
    const amounts = loans.map(estimateRepaymentCents).filter((v): v is number => v !== null)
    return amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) : null
  })()

  const weightedAvgRate = (() => {
    let weightedSum = 0, totalBalance = 0
    for (const l of loans) {
      const bal = l.latestBalance?.balanceCents
      const rate = l.interestRate != null ? parseFloat(l.interestRate) : null
      if (bal && rate != null && !isNaN(rate)) { weightedSum += bal * rate; totalBalance += bal }
    }
    return totalBalance > 0 ? weightedSum / totalBalance : null
  })()

  const entityOptions: FilterOption[] = entities.map(e => {
    const count = allLoans.filter(l => l.entityId === e.id).length
    return {
      id: e.id,
      name: e.name,
      subLabel: entityTypeSubLabel(e.type),
      count,
      entityType: e.type,
      disabled: count === 0,
    }
  })

  const uniqueLenders = Array.from(new Set(allLoans.map(l => l.lender).filter(Boolean)))
  const lenderOptions: FilterOption[] = uniqueLenders.map(lender => ({
    id: lender,
    name: lender,
    count: allLoans.filter(l => l.lender === lender).length,
  }))

  type LoanType = 'interest_only' | 'principal_and_interest' | 'line_of_credit'
  const uniqueTypes = Array.from(
    new Set(allLoans.map(l => l.loanType).filter((t): t is LoanType => t !== null))
  )
  const typeOptions: FilterOption[] = uniqueTypes.map(t => ({
    id: t,
    name: loanTypeLabel(t),
    subLabel: loanTypeFullLabel(t),
    count: allLoans.filter(l => l.loanType === t).length,
  }))

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

        <div className="grid grid-cols-4 gap-3 mb-6">
          <MetricTile
            label="Total debt"
            value={loading ? '…' : formatCents(totalDebtCents)}
            foot={<span>{loans.length} loan{loans.length !== 1 ? 's' : ''}</span>}
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

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <FilterChip
            label="Entity"
            labelPlural="entities"
            itemLabel="loans"
            value={entityFilter}
            options={entityOptions}
            onChange={setEntityFilter}
            variant="rich"
            actionLink={{ href: '/entities', label: 'Add or manage entities' }}
          />
          {lenderOptions.length > 0 && (
            <FilterChip
              label="Lender"
              value={lenderFilter}
              options={lenderOptions}
              onChange={setLenderFilter}
              variant="simple"
            />
          )}
          {typeOptions.length > 0 && (
            <FilterChip
              label="Type"
              value={typeFilter}
              options={typeOptions}
              onChange={setTypeFilter}
              variant="simple"
            />
          )}
        </div>

        <div>
          <div className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-2">
            All loans
          </div>

          {loading ? (
            <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-foreground-muted">
              Loading loans…
            </div>
          ) : loans.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-foreground-muted">
              {allLoans.length === 0 ? 'No loans yet. Add one with the button above.' : 'No loans match the current filter.'}
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
                    {loans.map(loan => (
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
