'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MetricTile } from '@/components/ui/metric-tile'
import { formatCents } from '@/lib/format'
import type { InstallmentLoanBalance } from '@/db/schema'
import type { InstallmentLoanDetail } from '@/lib/borrowings'
import type { LoanLedgerWithSource } from '@/lib/borrowings'

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function ioCountdownMonths(ioEndDate: string): number {
  const msRemaining = new Date(ioEndDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24 * 30.44)))
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loan, setLoan] = useState<InstallmentLoanDetail | null>(null)
  const [balances, setBalances] = useState<InstallmentLoanBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [editLender, setEditLender] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editLoanType, setEditLoanType] = useState<'interest_only' | 'principal_and_interest' | null>(null)
  const [editIoEndDate, setEditIoEndDate] = useState('')
  const [editInterestRate, setEditInterestRate] = useState('')
  const [saving, setSaving] = useState(false)

  const [addBalanceCents, setAddBalanceCents] = useState('')
  const [addBalanceDate, setAddBalanceDate] = useState('')
  const [addingBalance, setAddingBalance] = useState(false)

  const [repayments, setRepayments] = useState<LoanLedgerWithSource[]>([])
  const [repaymentsLoading, setRepaymentsLoading] = useState(false)
  const [repaymentsFetched, setRepaymentsFetched] = useState(false)
  const [addDate, setAddDate] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addInterest, setAddInterest] = useState('')
  const [addPrincipal, setAddPrincipal] = useState('')
  const [addingRepayment, setAddingRepayment] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [loanRes, balRes] = await Promise.all([
        fetch(`/api/loans/${id}`),
        fetch(`/api/loans/${id}/balances`),
      ])
      if (loanRes.status === 401) { router.push('/login'); return }
      if (loanRes.status === 404) { setNotFound(true); return }
      if (!loanRes.ok) { toast.error('Failed to load loan'); return }

      const { loan: loanData } = await loanRes.json() as { loan: InstallmentLoanDetail }
      setLoan(loanData)
      setEditLender(loanData.lender)
      setEditNickname(loanData.nickname ?? '')
      setEditStartDate(loanData.startDate)
      setEditEndDate(loanData.endDate)
      setEditLoanType(loanData.loanType ?? null)
      setEditIoEndDate(loanData.ioEndDate ?? '')
      setEditInterestRate(loanData.interestRate ?? '')

      if (balRes.ok) {
        const balData = await balRes.json() as { balances?: InstallmentLoanBalance[] }
        setBalances(balData.balances ?? [])
      }
    } catch {
      toast.error('Failed to load loan')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { loadData() }, [loadData])

  async function loadRepayments() {
    if (repaymentsFetched) return
    setRepaymentsLoading(true)
    try {
      const res = await fetch(`/api/loans/${id}/repayments`)
      if (!res.ok) { toast.error('Failed to load repayments'); return }
      const data = await res.json() as { repayments: LoanLedgerWithSource[] }
      setRepayments(data.repayments ?? [])
      setRepaymentsFetched(true)
    } finally {
      setRepaymentsLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender: editLender.trim(),
          nickname: editNickname.trim() || null,
          startDate: editStartDate,
          endDate: editEndDate,
          loanType: editLoanType,
          ioEndDate: editLoanType === 'interest_only' ? (editIoEndDate || null) : null,
          interestRate: editInterestRate ? parseFloat(editInterestRate) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to save')
        return
      }
      const { loan: updated } = await res.json() as { loan: InstallmentLoanDetail }
      setLoan(prev => prev ? { ...prev, ...updated } : null)
      toast.success('Saved')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddBalance() {
    if (!addBalanceCents.trim() || !addBalanceDate) return
    const dollars = parseFloat(addBalanceCents.replace(/,/g, ''))
    if (isNaN(dollars)) { toast.error('Invalid amount'); return }
    const balanceCents = Math.round(dollars * 100)

    setAddingBalance(true)
    try {
      const res = await fetch(`/api/loans/${id}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balanceCents, recordedAt: addBalanceDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add balance')
        return
      }
      const { balance } = await res.json() as { balance: InstallmentLoanBalance }
      setBalances(prev => [balance, ...prev].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)))
      setLoan(prev => prev ? { ...prev, latestBalance: { balanceCents: balance.balanceCents, recordedAt: balance.recordedAt } } : null)
      setAddBalanceCents('')
      setAddBalanceDate('')
      toast.success('Balance added')
    } finally {
      setAddingBalance(false)
    }
  }

  async function handleAddRepayment() {
    if (!addDate || !addAmount.trim()) return
    const dollars = parseFloat(addAmount.replace(/,/g, ''))
    if (isNaN(dollars) || dollars <= 0) { toast.error('Invalid amount'); return }
    const amountCents = Math.round(dollars * 100)

    const interestDollars = addInterest.trim() ? parseFloat(addInterest.replace(/,/g, '')) : null
    const principalDollars = addPrincipal.trim() ? parseFloat(addPrincipal.replace(/,/g, '')) : null

    setAddingRepayment(true)
    try {
      const res = await fetch(`/api/loans/${id}/repayments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate: addDate,
          amountCents,
          interestCents: interestDollars !== null && !isNaN(interestDollars) ? Math.round(interestDollars * 100) : null,
          principalCents: principalDollars !== null && !isNaN(principalDollars) ? Math.round(principalDollars * 100) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add repayment')
        return
      }
      const { repayment } = await res.json() as { repayment: LoanLedgerWithSource }
      setRepayments(prev => [repayment, ...prev])
      setAddDate('')
      setAddAmount('')
      setAddInterest('')
      setAddPrincipal('')
      toast.success('Repayment added')
    } finally {
      setAddingRepayment(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    )
  }

  if (notFound || !loan) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted">Loan not found.</p>
        <Link href="/loans" className="text-accent text-sm hover:underline mt-2 inline-block">← Back to loans</Link>
      </div>
    )
  }

  const currentBalance = loan.latestBalance?.balanceCents ?? null

  // IO countdown tile
  let ioTileValue: string
  let ioTileFoot: React.ReactNode
  let ioMonths = 0
  if (loan.loanType === 'interest_only' && loan.ioEndDate) {
    ioMonths = ioCountdownMonths(loan.ioEndDate)
    ioTileValue = `${ioMonths} months`
    ioTileFoot = (
      <span className="flex items-center gap-2 text-xs text-muted">
        <span>{formatDate(loan.ioEndDate)}</span>
        {ioMonths <= 18 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
            <span className="w-1 h-1 rounded-full bg-amber-500 inline-block" />
            Plan ahead
          </span>
        )}
      </span>
    )
  } else if (loan.loanType === 'principal_and_interest') {
    ioTileValue = 'P&I'
    ioTileFoot = <span className="text-xs text-muted">Principal &amp; interest</span>
  } else {
    ioTileValue = '—'
    ioTileFoot = <span className="text-xs text-muted">Loan type not set</span>
  }

  // Repayments summary
  const totalPaidCents = repayments.reduce((sum, r) => sum + r.amountCents, 0)
  const allInterestOnly = repayments.length > 0 && repayments.every(r => r.principalCents === null || r.principalCents === 0)

  return (
    <div>
      <div className="mb-2">
        <Link href="/loans" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors">
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Loans
        </Link>
      </div>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-serif text-2xl text-ink">{loan.nickname ?? loan.lender}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted">
            <span>{loan.lender}</span>
            {loan.propertyAddress && (
              <>
                <span>·</span>
                <span>{loan.propertyAddress}</span>
              </>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="mr-1.5" aria-hidden>
            <path d="M3 11v2h10v-2"/><path d="M8 3v8M5 6l3-3 3 3"/>
          </svg>
          Upload statement
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-7">
        <MetricTile
          label="Current balance"
          value={currentBalance !== null ? formatCents(currentBalance) : '—'}
          foot={loan.latestBalance ? <span className="text-xs text-muted">as of {formatDate(loan.latestBalance.recordedAt)}</span> : undefined}
        />
        <MetricTile
          label={loan.loanType === 'interest_only' ? 'IO period ends in' : 'Loan type'}
          value={ioTileValue}
          foot={ioTileFoot}
          secondary
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="repayments" onClick={loadRepayments}>Repayments</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 gap-6">

            {/* Loan terms */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Loan terms</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lender">Lender</Label>
                  <Input id="lender" value={editLender} onChange={e => setEditLender(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nickname">Nickname <span className="font-normal text-muted">(optional)</span></Label>
                  <Input id="nickname" value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="e.g. Inv Loan · Elm St" />
                </div>
                <div className="space-y-1.5">
                  <Label>Loan type</Label>
                  <div className="flex rounded-md border border-border overflow-hidden w-fit">
                    {(['interest_only', 'principal_and_interest'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setEditLoanType(editLoanType === type ? null : type)}
                        className={[
                          'px-3 h-8 text-xs font-medium transition-colors',
                          editLoanType === type
                            ? 'bg-ink text-surface'
                            : 'bg-surface text-muted hover:text-ink',
                          type === 'principal_and_interest' ? 'border-l border-border' : '',
                        ].join(' ')}
                      >
                        {type === 'interest_only' ? 'IO' : 'P&I'}
                      </button>
                    ))}
                  </div>
                </div>
                {editLoanType === 'interest_only' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="io-end-date">IO end date</Label>
                    <Input id="io-end-date" type="date" value={editIoEndDate} onChange={e => setEditIoEndDate(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="interest-rate">Rate (est.) <span className="font-normal text-muted">(optional)</span></Label>
                  <div className="relative">
                    <Input
                      id="interest-rate"
                      type="text"
                      inputMode="decimal"
                      placeholder="6.35"
                      className="pr-7"
                      value={editInterestRate}
                      onChange={e => setEditInterestRate(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="security">Security</Label>
                  <p className="text-sm text-ink">{loan.propertyAddress ?? 'No property linked'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start-date">Start date</Label>
                    <Input id="start-date" type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end-date">End date</Label>
                    <Input id="end-date" type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>

            {/* Balance history */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Balance history</h3>

              {balances.length === 0 ? (
                <p className="text-sm text-muted mb-4">No balance snapshots recorded yet.</p>
              ) : (
                <div className="space-y-1 mb-5">
                  {balances.map(b => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-ruled last:border-b-0">
                      <span className="text-sm text-muted">{formatDate(b.recordedAt)}</span>
                      <span className="text-sm font-medium tabular-nums">{formatCents(b.balanceCents)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Add balance snapshot</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="bal-amount">Balance ($)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                        <Input
                          id="bal-amount"
                          type="text"
                          inputMode="decimal"
                          placeholder="615,000"
                          className="pl-7"
                          value={addBalanceCents}
                          onChange={e => setAddBalanceCents(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bal-date">As of date</Label>
                      <Input
                        id="bal-date"
                        type="date"
                        value={addBalanceDate}
                        onChange={e => setAddBalanceDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddBalance}
                    disabled={addingBalance || !addBalanceCents.trim() || !addBalanceDate}
                  >
                    {addingBalance ? 'Adding…' : '+ Add snapshot'}
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </TabsContent>

        <TabsContent value="repayments" className="mt-6">
          {repaymentsLoading ? (
            <div className="text-sm text-muted py-8 text-center">Loading repayments…</div>
          ) : (
            <div>
              {repayments.length === 0 && repaymentsFetched ? (
                <p className="text-sm text-muted mb-6">No repayments recorded yet.</p>
              ) : (
                <>
                  {/* Table */}
                  <div className="w-full">
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr] text-xs font-semibold text-muted uppercase tracking-wider pb-2 border-b border-border">
                      <span>Date</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Interest</span>
                      <span className="text-right">Principal</span>
                      <span className="pl-4">Source</span>
                    </div>
                    {repayments.map(r => (
                      <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr] py-2.5 border-b border-ruled last:border-b-0 items-center">
                        <span className="text-sm text-muted">{formatDate(r.paymentDate)}</span>
                        <span className="text-sm font-medium tabular-nums text-right">
                          −{formatCents(r.amountCents)}
                        </span>
                        <span className={['text-sm tabular-nums text-right', r.interestCents === null ? 'text-faint' : 'text-muted'].join(' ')}>
                          {r.interestCents !== null ? formatCents(r.interestCents) : '—'}
                        </span>
                        <span className={['text-sm tabular-nums text-right', r.principalCents === null ? 'text-faint' : 'text-muted'].join(' ')}>
                          {r.principalCents !== null ? formatCents(r.principalCents) : '—'}
                        </span>
                        <span className="pl-4 text-sm flex items-center gap-1.5">
                          {r.sourceDocumentId ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-muted shrink-0" aria-hidden>
                                <path d="M2 1h7l2 2v8H2z"/><path d="M9 1v2h2M5 8h3"/>
                              </svg>
                              <span className="text-muted truncate">{r.sourceFileName ?? 'Statement'}</span>
                            </>
                          ) : (
                            <span className="text-faint">Manual</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Summary footer */}
                  {repayments.length > 0 && (
                    <div className="flex items-center justify-between pt-3 text-sm text-muted border-t border-border">
                      <span>{formatCents(totalPaidCents)} paid · {repayments.length} {repayments.length === 1 ? 'entry' : 'entries'}</span>
                      {allInterestOnly && <span>100% interest</span>}
                    </div>
                  )}
                </>
              )}

              {/* Add repayment form */}
              <div className="mt-7 pt-6 border-t border-dashed border-border">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Add repayment</h3>
                    <p className="text-xs text-muted mt-0.5">Record a one-off entry, or upload a lender statement to import them in bulk.</p>
                  </div>
                </div>
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_auto] gap-3 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="rep-date" className="text-[11px]">Date <span className="text-red-500">*</span></Label>
                    <Input id="rep-date" type="date" value={addDate} onChange={e => setAddDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rep-amount" className="text-[11px]">Amount <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                      <Input
                        id="rep-amount"
                        type="text"
                        inputMode="decimal"
                        placeholder="2,167.00"
                        className="pl-7"
                        value={addAmount}
                        onChange={e => setAddAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rep-interest" className="text-[11px]">Interest <span className="text-muted font-normal">(optional)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                      <Input
                        id="rep-interest"
                        type="text"
                        inputMode="decimal"
                        placeholder="2,167.00"
                        className="pl-7"
                        value={addInterest}
                        onChange={e => setAddInterest(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rep-principal" className="text-[11px]">Principal <span className="text-muted font-normal">(optional)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                      <Input
                        id="rep-principal"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        className="pl-7"
                        value={addPrincipal}
                        onChange={e => setAddPrincipal(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddRepayment}
                    disabled={addingRepayment || !addDate || !addAmount.trim()}
                  >
                    {addingRepayment ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="statements" className="mt-6">
          <div className="text-sm text-muted py-8 text-center">Statements coming soon.</div>
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <div className="text-sm text-muted py-8 text-center">Documents coming soon.</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
