'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricTile } from '@/components/ui/metric-tile'
import { formatCents } from '@/lib/format'
import type { ReactNode } from 'react'
import type { InstallmentLoan, InstallmentLoanBalance } from '@/db/schema'
import type { InstallmentLoanDetail, LoanLedgerWithSource } from '@/lib/borrowings'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function ioCountdownMonths(ioEndDate: string): number {
  const msRemaining = new Date(ioEndDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24 * 30.44)))
}

const LENDER_BG: Record<string, string> = {
  cba: 'hsl(212 48% 30%)',
  westpac: 'hsl(0 65% 38%)',
  anz: 'hsl(208 70% 36%)',
  nab: 'hsl(2 60% 36%)',
  macquarie: 'hsl(0 0% 12%)',
}

function lenderGlyphStyle(lender: string): React.CSSProperties {
  const key = lender.toLowerCase().split(/\s+/)[0]
  const bg = LENDER_BG[key]
  return bg
    ? { background: bg, color: 'white' }
    : { background: 'hsl(var(--color-surface-sunken))', color: 'hsl(var(--color-foreground-muted))' }
}

function lenderAbbr(lender: string): string {
  return lender.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3)
}

type FieldRowProps = {
  label: ReactNode
  fieldKey: string
  editingField: string | null
  editValue: string
  fieldSaving: string | null
  displayValue: string | null
  inputType?: 'text' | 'date'
  editSuffix?: string
  onStartEdit: () => void
  onValueChange: (v: string) => void
  onCommit: (v: string) => void
  onCancel: () => void
  last?: boolean
}

function FieldRow({
  label, fieldKey, editingField, editValue, fieldSaving, displayValue,
  inputType = 'text', editSuffix, onStartEdit, onValueChange, onCommit, onCancel, last,
}: FieldRowProps) {
  const isEditing = editingField === fieldKey
  const isSaving = fieldSaving === fieldKey
  return (
    <div
      className={`grid items-center py-3 ${last ? '' : 'border-b border-rule'}`}
      style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}
    >
      <div className="text-xs font-medium text-foreground-subtle">{label}</div>
      <div>
        {isEditing ? (
          <div className="relative">
            <input
              type={inputType}
              autoFocus
              value={editValue}
              onChange={e => onValueChange(e.target.value)}
              onBlur={() => onCommit(editValue)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.currentTarget.blur() }
                if (e.key === 'Escape') onCancel()
              }}
              className={`w-full text-sm px-2 py-1 rounded border border-border bg-surface outline-none focus:border-accent transition-colors${editSuffix ? ' pr-7' : ''}`}
            />
            {editSuffix && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-foreground-muted pointer-events-none">
                {editSuffix}
              </span>
            )}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={onStartEdit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onStartEdit() }}
            className={`group text-sm text-foreground cursor-pointer px-2 py-0.5 -mx-2 rounded inline-flex items-center gap-1 transition-colors${isSaving ? ' opacity-50' : ' hover:bg-surface-sunken'}`}
          >
            {displayValue !== null && displayValue !== ''
              ? <span>{displayValue}</span>
              : <span className="text-foreground-faint">—</span>
            }
            {!isSaving && (
              <span className="opacity-0 group-hover:opacity-60 transition-opacity">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                  <path d="M2 8.5L8 2.5l1.5 1.5L3.5 10H2v-1.5z" />
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loan, setLoan] = useState<InstallmentLoanDetail | null>(null)
  const [balances, setBalances] = useState<InstallmentLoanBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [activeTab, setActiveTab] = useState<'overview' | 'repayments'>('overview')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [fieldSaving, setFieldSaving] = useState<string | null>(null)

  const [addBalanceDollars, setAddBalanceDollars] = useState('')
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
        fetch(`/api/v1/loans/${id}`),
        fetch(`/api/v1/loans/${id}/balances`),
      ])
      if (loanRes.status === 401) { router.push('/login'); return }
      if (loanRes.status === 404) { setNotFound(true); return }
      if (!loanRes.ok) { toast.error('Failed to load loan'); return }

      const { loan: loanData } = await loanRes.json() as { loan: InstallmentLoanDetail }
      setLoan(loanData)

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
    if (repaymentsFetched || repaymentsLoading) return
    setRepaymentsLoading(true)
    try {
      const res = await fetch(`/api/v1/loans/${id}/repayments`)
      if (!res.ok) { toast.error('Failed to load repayments'); return }
      const data = await res.json() as { repayments: LoanLedgerWithSource[] }
      setRepayments(data.repayments ?? [])
      setRepaymentsFetched(true)
    } catch {
      toast.error('Failed to load repayments')
    } finally {
      setRepaymentsLoading(false)
    }
  }

  async function patchLoan(updates: Record<string, unknown>, currentLoan: InstallmentLoanDetail) {
    const res = await fetch(`/api/v1/loans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error ?? 'Failed to save')
    }
    const { loan: updated } = await res.json() as { loan: InstallmentLoan }
    setLoan({
      ...currentLoan,
      ...updated,
      propertyAddress: currentLoan.propertyAddress,
      entityName: currentLoan.entityName,
      latestBalance: currentLoan.latestBalance,
    })
  }

  function startEdit(field: string, currentValue: string | null | undefined) {
    setEditingField(field)
    setEditValue(currentValue ?? '')
  }

  async function commitField(field: string, value: string) {
    setEditingField(null)
    if (!loan) return

    let updates: Record<string, unknown>
    if (field === 'lender') {
      if (!value.trim() || value.trim() === loan.lender) return
      updates = { lender: value.trim() }
    } else if (field === 'nickname') {
      const n = value.trim() || null
      if (n === (loan.nickname ?? null)) return
      updates = { nickname: n }
    } else if (field === 'interestRate') {
      const rate = value.trim() ? parseFloat(value) : null
      if (String(rate) === String(loan.interestRate ?? null)) return
      if (rate !== null && isNaN(rate)) { toast.error('Invalid rate'); return }
      updates = { interestRate: rate }
    } else if (field === 'startDate') {
      if (!value || value === loan.startDate) return
      updates = { startDate: value }
    } else if (field === 'endDate') {
      if (!value || value === loan.endDate) return
      updates = { endDate: value }
    } else if (field === 'ioEndDate') {
      const d = value || null
      if (d === (loan.ioEndDate ?? null)) return
      updates = { ioEndDate: d }
    } else {
      return
    }

    setFieldSaving(field)
    try {
      await patchLoan(updates, loan)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setFieldSaving(null)
    }
  }

  async function toggleLoanType(type: 'interest_only' | 'principal_and_interest') {
    if (!loan) return
    const newType = loan.loanType === type ? null : type
    const updates: Record<string, unknown> = { loanType: newType }
    if (newType !== 'interest_only') updates.ioEndDate = null
    setFieldSaving('loanType')
    try {
      await patchLoan(updates, loan)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setFieldSaving(null)
    }
  }

  async function handleAddBalance() {
    if (!addBalanceDollars.trim() || !addBalanceDate) return
    const dollars = parseFloat(addBalanceDollars.replace(/,/g, ''))
    if (isNaN(dollars)) { toast.error('Invalid amount'); return }
    const balanceCents = Math.round(dollars * 100)

    setAddingBalance(true)
    try {
      const res = await fetch(`/api/v1/loans/${id}/balances`, {
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
      setAddBalanceDollars('')
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
      const res = await fetch(`/api/v1/loans/${id}/repayments`, {
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
        <span className="text-sm text-foreground-muted">Loading…</span>
      </div>
    )
  }

  if (notFound || !loan) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-foreground-muted">Loan not found.</p>
        <Link href="/loans" className="text-accent text-sm hover:underline mt-2 inline-block">← Back to loans</Link>
      </div>
    )
  }

  const currentBalance = loan.latestBalance?.balanceCents ?? null

  let ioTileValue: string
  let ioTileFoot: React.ReactNode
  let ioMonths = 0
  if (loan.loanType === 'interest_only' && loan.ioEndDate) {
    ioMonths = ioCountdownMonths(loan.ioEndDate)
    ioTileValue = `${ioMonths} months`
    ioTileFoot = (
      <span className="flex items-center gap-2 text-xs text-foreground-muted">
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
    ioTileFoot = <span className="text-xs text-foreground-muted">Principal &amp; interest</span>
  } else {
    ioTileValue = '—'
    ioTileFoot = <span className="text-xs text-foreground-muted">Loan type not set</span>
  }

  const loanTypeSubtitle = loan.loanType === 'interest_only'
    ? `Interest only${loan.ioEndDate ? ` · IO ends ${formatDate(loan.ioEndDate)}` : ''}`
    : loan.loanType === 'principal_and_interest'
      ? 'Principal & interest'
      : null

  const totalPaidCents = repayments.reduce((sum, r) => sum + r.amountCents, 0)
  const allInterestOnly = repayments.length > 0 && repayments.every(r => r.principalCents === null || r.principalCents === 0)

  const glyphStyle = lenderGlyphStyle(loan.lender)
  const abbr = lenderAbbr(loan.lender)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-foreground-muted mb-3">
        <Link href="/loans" className="hover:text-foreground transition-colors">Loans</Link>
        <span>›</span>
        <span>{loan.lender}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground">
          {loan.nickname ?? loan.lender}{loan.propertyAddress ? ` · ${loan.propertyAddress}` : ''}
        </h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 border border-border rounded-full text-xs text-foreground-muted bg-surface-sunken pl-0.5 pr-3 py-0.5">
            <span
              className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold tracking-tight"
              style={glyphStyle}
            >
              {abbr}
            </span>
            {loan.lender}
          </span>
          {loan.entityName && (
            <span className="inline-flex items-center h-[22px] px-3 rounded-full text-[10px] font-medium uppercase tracking-wide bg-surface-sunken text-foreground-muted border border-border whitespace-nowrap">
              {loan.entityName}
            </span>
          )}
          {loanTypeSubtitle && (
            <span className="text-xs text-foreground-subtle">{loanTypeSubtitle}</span>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-7">
        <MetricTile
          label="Current balance"
          value={currentBalance !== null ? formatCents(currentBalance) : '—'}
          foot={loan.latestBalance ? <span className="text-xs text-foreground-muted">as of {formatDate(loan.latestBalance.recordedAt)}</span> : undefined}
        />
        <MetricTile
          label={loan.loanType === 'interest_only' ? 'IO period ends in' : 'Loan type'}
          value={ioTileValue}
          foot={ioTileFoot}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-8 border-b border-border mb-7">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`relative pb-3 pt-2 text-sm font-medium transition-colors${activeTab === 'overview' ? ' text-foreground' : ' text-foreground-muted hover:text-foreground'}`}
        >
          Overview
          {activeTab === 'overview' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('repayments'); void loadRepayments() }}
          className={`relative pb-3 pt-2 text-sm font-medium transition-colors${activeTab === 'repayments' ? ' text-foreground' : ' text-foreground-muted hover:text-foreground'}`}
        >
          Repayments
          {activeTab === 'repayments' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
        </button>
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">

          {/* Loan terms — inline editing */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-baseline justify-between mb-5">
              <h3 className="text-sm font-semibold text-foreground">Loan terms</h3>
              <span className="text-xs text-foreground-muted">Click any field to edit</span>
            </div>
            <div className="flex flex-col">
              <FieldRow
                label="Lender"
                fieldKey="lender"
                editingField={editingField}
                editValue={editValue}
                fieldSaving={fieldSaving}
                displayValue={loan.lender}
                onStartEdit={() => startEdit('lender', loan.lender)}
                onValueChange={setEditValue}
                onCommit={v => commitField('lender', v)}
                onCancel={() => setEditingField(null)}
              />
              <FieldRow
                label={<>Account / loan reference <span className="font-normal text-foreground-faint">optional</span></>}
                fieldKey="accountReference"
                editingField={editingField}
                editValue={editValue}
                fieldSaving={fieldSaving}
                displayValue={loan.accountReference ?? null}
                onStartEdit={() => startEdit('accountReference', loan.accountReference ?? '')}
                onValueChange={setEditValue}
                onCommit={v => commitField('accountReference', v)}
                onCancel={() => setEditingField(null)}
              />
              <FieldRow
                label={<>Nickname <span className="font-normal text-foreground-faint">optional</span></>}
                fieldKey="nickname"
                editingField={editingField}
                editValue={editValue}
                fieldSaving={fieldSaving}
                displayValue={loan.nickname ?? null}
                onStartEdit={() => startEdit('nickname', loan.nickname ?? '')}
                onValueChange={setEditValue}
                onCommit={v => commitField('nickname', v)}
                onCancel={() => setEditingField(null)}
              />
              {/* Loan type segmented control */}
              <div
                className="grid items-center py-3 border-b border-rule"
                style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}
              >
                <div className="text-xs font-medium text-foreground-subtle">Loan type</div>
                <div className="flex rounded-md border border-border bg-surface p-0.5 gap-0.5 w-fit">
                  {(['interest_only', 'principal_and_interest'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleLoanType(type)}
                      disabled={fieldSaving === 'loanType'}
                      className={[
                        'px-2.5 py-0.5 text-xs font-medium transition-colors rounded',
                        loan.loanType === type
                          ? 'bg-foreground text-background shadow-sm'
                          : 'text-foreground-muted hover:text-foreground',
                      ].join(' ')}
                    >
                      {type === 'interest_only' ? 'IO' : 'P&I'}
                    </button>
                  ))}
                </div>
              </div>
              <FieldRow
                label={<>Rate (est.) <span className="font-normal text-foreground-faint">optional</span></>}
                fieldKey="interestRate"
                editingField={editingField}
                editValue={editValue}
                fieldSaving={fieldSaving}
                displayValue={loan.interestRate ? `${loan.interestRate}%` : null}
                editSuffix="%"
                onStartEdit={() => startEdit('interestRate', loan.interestRate ?? '')}
                onValueChange={setEditValue}
                onCommit={v => commitField('interestRate', v)}
                onCancel={() => setEditingField(null)}
              />
              <FieldRow
                label="Start date"
                fieldKey="startDate"
                editingField={editingField}
                editValue={editValue}
                fieldSaving={fieldSaving}
                displayValue={formatDate(loan.startDate)}
                inputType="date"
                onStartEdit={() => startEdit('startDate', loan.startDate)}
                onValueChange={setEditValue}
                onCommit={v => commitField('startDate', v)}
                onCancel={() => setEditingField(null)}
              />
              {loan.loanType === 'interest_only' && (
                <FieldRow
                  label="IO end date"
                  fieldKey="ioEndDate"
                  editingField={editingField}
                  editValue={editValue}
                  fieldSaving={fieldSaving}
                  displayValue={loan.ioEndDate ? formatDate(loan.ioEndDate) : null}
                  inputType="date"
                  onStartEdit={() => startEdit('ioEndDate', loan.ioEndDate ?? '')}
                  onValueChange={setEditValue}
                  onCommit={v => commitField('ioEndDate', v)}
                  onCancel={() => setEditingField(null)}
                />
              )}
              {/* Security — read only */}
              <div
                className="grid items-center py-3"
                style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}
              >
                <div className="text-xs font-medium text-foreground-subtle">Security</div>
                <div className="text-sm text-foreground">
                  {loan.propertyAddress
                    ? <span className="font-medium">{loan.propertyAddress}</span>
                    : <span className="text-foreground-faint">No property linked</span>
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Balance history */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-baseline justify-between mb-5">
              <h3 className="text-sm font-semibold text-foreground">Balance history</h3>
              {balances.length > 0 && (
                <span className="text-xs text-foreground-muted">{balances.length} snapshot{balances.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {balances.length === 0 ? (
              <p className="text-sm text-foreground-muted mb-4">No balance snapshots recorded yet.</p>
            ) : (
              <div className="mb-5">
                {balances.map(b => (
                  <div key={b.id} className="flex items-center justify-between py-2 border-b border-rule last:border-b-0">
                    <span className="text-sm text-foreground-muted">{formatDate(b.recordedAt)}</span>
                    <span className="text-sm font-medium tabular-nums">{formatCents(b.balanceCents)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-5" style={{ borderTop: '1px dashed hsl(var(--color-rule))' }}>
              <div className="grid gap-3 items-end" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                <div>
                  <label className="block text-[11px] text-foreground-muted mb-1">Date</label>
                  <Input type="date" value={addBalanceDate} onChange={e => setAddBalanceDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] text-foreground-muted mb-1">Balance</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="615,000"
                      className="pl-7"
                      value={addBalanceDollars}
                      onChange={e => setAddBalanceDollars(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddBalance}
                  disabled={addingBalance || !addBalanceDollars.trim() || !addBalanceDate}
                  style={{ height: '32px' }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="mr-1" aria-hidden>
                    <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
                  </svg>
                  {addingBalance ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Repayments tab */}
      {activeTab === 'repayments' && (
        <div>
          {repaymentsLoading ? (
            <div className="text-sm text-foreground-muted py-8 text-center">Loading repayments…</div>
          ) : (
            <>
              {repaymentsFetched && repayments.length === 0 && (
                <p className="text-sm text-foreground-muted mb-6">No repayments recorded yet.</p>
              )}
              {repayments.length > 0 && (
                <>
                  <div className="w-full">
                    <div
                      className="grid text-xs font-semibold text-foreground-muted uppercase tracking-wider pb-2 border-b border-border"
                      style={{ gridTemplateColumns: '130px 140px 130px 130px 1fr' }}
                    >
                      <span>Date</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Interest</span>
                      <span className="text-right">Principal</span>
                      <span>Source</span>
                    </div>
                    {repayments.map(r => (
                      <div
                        key={r.id}
                        className="grid py-2.5 border-b border-rule last:border-b-0 items-center"
                        style={{ gridTemplateColumns: '130px 140px 130px 130px 1fr' }}
                      >
                        <span className="text-sm text-foreground-muted">{formatDate(r.paymentDate)}</span>
                        <span className="text-sm font-semibold tabular-nums text-right">
                          −{formatCents(r.amountCents)}
                        </span>
                        <span className={`text-sm tabular-nums text-right ${r.interestCents === null ? 'text-foreground-faint' : 'text-foreground-muted'}`}>
                          {r.interestCents !== null ? formatCents(r.interestCents) : '—'}
                        </span>
                        <span className={`text-sm tabular-nums text-right ${r.principalCents === null ? 'text-foreground-faint' : 'text-foreground-muted'}`}>
                          {r.principalCents !== null ? formatCents(r.principalCents) : '—'}
                        </span>
                        <span className="text-sm flex items-center gap-1.5">
                          {r.sourceDocumentId ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-foreground-muted shrink-0" aria-hidden>
                                <path d="M2 1h7l2 2v8H2z" /><path d="M9 1v2h2M5 8h3" />
                              </svg>
                              <span className="text-foreground-muted truncate">{r.sourceFileName ?? 'Statement'}</span>
                            </>
                          ) : (
                            <span className="text-foreground-faint">Manual</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-3 text-sm text-foreground-muted border-t border-border">
                    <span>{formatCents(totalPaidCents)} paid · {repayments.length} {repayments.length === 1 ? 'entry' : 'entries'}</span>
                    {allInterestOnly && <span>100% interest</span>}
                  </div>
                </>
              )}

              {/* Add repayment form */}
              <div className="mt-7 pt-6" style={{ borderTop: '1px dashed hsl(var(--color-rule))' }}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Add repayment</h3>
                    <p className="text-xs text-foreground-muted mt-0.5">Record a one-off entry, or upload a lender statement to import them in bulk.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="mr-1.5" aria-hidden>
                      <path d="M3 11v2h10v-2" /><path d="M8 3v8M5 6l3-3 3 3" />
                    </svg>
                    Upload statement
                  </Button>
                </div>
                <div className="grid gap-3 items-end" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 1fr auto' }}>
                  <div>
                    <Label htmlFor="rep-date" className="text-[11px]">Date <span className="text-red-500">*</span></Label>
                    <Input id="rep-date" type="date" value={addDate} onChange={e => setAddDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="rep-amount" className="text-[11px]">Amount <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
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
                  <div>
                    <Label htmlFor="rep-interest" className="text-[11px]">Interest <span className="text-foreground-muted font-normal">(opt.)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
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
                  <div>
                    <Label htmlFor="rep-principal" className="text-[11px]">Principal <span className="text-foreground-muted font-normal">(opt.)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
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
                    {addingRepayment ? 'Adding…' : '+ Add'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
