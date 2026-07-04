'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ComposedChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricTile } from '@/components/ui/metric-tile'
import { LvrMeter } from '@/components/ui/lvr-meter'
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { formatCents, recentMonths } from '@/lib/format'
import type {
  Property, PropertyLedger, PropertyValuation, InstallmentLoan,
  Entity, PropertyTenancy, PropertyManagementAgent, PropertyType, StatementCadence,
  LedgerCategory,
} from '@/db/schema'

type LatestValuation = { valueCents: number; valuedAt: string; source: string | null } | null
type YieldStats = { grossPercent: number; netPercent: number; periodLabel: string } | null
type LoanWithBalance = InstallmentLoan & {
  latestBalance: { balanceCents: number; recordedAt: string } | null
  recentBalances: { id: string; balanceCents: number; recordedAt: string }[]
}
type TrendPoint = {
  month: string
  rentCents: number
  otherIncomeCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasData: boolean
}

const MANUAL_CATEGORIES = [
  'rent', 'insurance', 'rates', 'repairs',
  'property_management', 'utilities', 'strata_fees', 'other_expense', 'other_income',
] as const

const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  rent: 'Rent', insurance: 'Insurance', rates: 'Rates', repairs: 'Repairs',
  property_management: 'Mgmt fee', utilities: 'Utilities',
  strata_fees: 'Strata', other_expense: 'Other expense', loan_payment: 'Loan repayment',
  other_income: 'Other income',
}

// Includes loan_payment (unlike MANUAL_CATEGORIES) so an imported entry already
// categorized as a loan payment can still be corrected without losing that value.
const CORRECTION_CATEGORIES: LedgerCategory[] = [...MANUAL_CATEGORIES, 'loan_payment']
const CORRECTION_CATEGORY_OPTIONS = CORRECTION_CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c] }))

const VALUATION_SOURCES = [
  { value: 'manual_estimate', label: 'Manual estimate' },
  { value: 'bank_valuation', label: 'Bank valuation' },
  { value: 'agent_appraisal', label: 'Agent appraisal' },
  { value: 'independent_valuer', label: 'Independent valuer' },
  { value: 'comparable_sale', label: 'Recent comparable sale' },
]

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'unit', label: 'Unit / Apartment' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'land', label: 'Land' },
]

const CADENCE_LABELS: Record<StatementCadence, string> = {
  weekly: 'Weekly', fortnightly: 'Fortnightly',
  monthly: 'Monthly', bi_monthly: 'Bi-monthly',
}

const CATEGORY_COLORS: Record<string, string> = {
  rent:                'hsl(152 38% 30%)',
  other_income:        'hsl(152 38% 45%)',
  insurance:           'hsl(14 58% 42%)',
  rates:               'hsl(14 58% 42%)',
  repairs:             'hsl(14 58% 42%)',
  property_management: 'hsl(14 58% 42%)',
  utilities:           'hsl(14 58% 42%)',
  strata_fees:         'hsl(14 58% 42%)',
  other_expense:       'hsl(32 6% 50%)',
  loan_payment:        'hsl(32 6% 38%)',
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isActiveByDate(end: string | null): boolean {
  if (!end) return true
  return end >= todayIso()
}

function SelectField({
  id, label, value, onChange, children, optional,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  optional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{optional && <span className="font-normal text-foreground-muted"> (optional)</span>}</Label>
      <select
        id={id}
        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  )
}

type PropFieldRowProps = {
  label: ReactNode
  fieldKey: string
  editingField: string | null
  editValue: string
  fieldSaving: string | null
  displayValue: string | null
  inputType?: 'text' | 'date'
  editPrefix?: string
  onStartEdit: () => void
  onValueChange: (v: string) => void
  onCommit: (v: string) => void
  onCancel: () => void
  last?: boolean
}

function PropFieldRow({
  label, fieldKey, editingField, editValue, fieldSaving, displayValue,
  inputType = 'text', editPrefix, onStartEdit, onValueChange, onCommit, onCancel, last,
}: PropFieldRowProps) {
  const isEditing = editingField === fieldKey
  const isSaving = fieldSaving === fieldKey
  return (
    <div className={`grid items-center py-3 ${last ? '' : 'border-b border-rule'}`}
      style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
      <div className="text-xs font-medium text-foreground-subtle">{label}</div>
      <div>
        {isEditing ? (
          <div className="relative inline-flex items-center">
            {editPrefix && (
              <span className="absolute left-2 text-sm text-foreground-muted pointer-events-none">{editPrefix}</span>
            )}
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
              className={`text-sm px-2 py-1 rounded border border-border bg-surface outline-none focus:border-accent transition-colors${editPrefix ? ' pl-5' : ''}`}
              style={{ minWidth: inputType === 'date' ? '140px' : '160px' }}
            />
          </div>
        ) : (
          <div
            role="button" tabIndex={0}
            onClick={onStartEdit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onStartEdit() }}
            className={`group text-sm text-foreground cursor-pointer px-2 py-0.5 -mx-2 rounded inline-flex items-center gap-1 transition-colors${isSaving ? ' opacity-50' : ' hover:bg-surface-sunken'}`}
          >
            {displayValue
              ? <span>{displayValue}</span>
              : <span className="text-foreground-faint">—</span>}
            {!isSaving && (
              <span className="opacity-0 group-hover:opacity-60 transition-opacity">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                  <path d="M2 8.5L8 2.5l1.5 1.5L3.5 10H2v-1.5z"/>
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type PropSelectRowProps = {
  label: ReactNode
  fieldKey: string
  editingField: string | null
  editValue: string
  fieldSaving: string | null
  displayValue: string | null
  options: { value: string; label: string }[]
  onStartEdit: () => void
  onValueChange: (v: string) => void
  onCommit: (v: string) => void
  onCancel: () => void
  last?: boolean
}

function PropSelectRow({
  label, fieldKey, editingField, editValue, fieldSaving, displayValue,
  options, onStartEdit, onValueChange, onCommit, onCancel, last,
}: PropSelectRowProps) {
  const isEditing = editingField === fieldKey
  const isSaving = fieldSaving === fieldKey
  return (
    <div className={`grid items-center py-3 ${last ? '' : 'border-b border-rule'}`}
      style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
      <div className="text-xs font-medium text-foreground-subtle">{label}</div>
      <div>
        {isEditing ? (
          <select
            autoFocus
            value={editValue}
            onChange={e => { const v = e.target.value; onValueChange(v); onCommit(v) }}
            onBlur={() => onCancel()}
            onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            className="text-sm px-2 py-1 rounded border border-border bg-surface outline-none focus:border-accent transition-colors"
          >
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <div
            role="button" tabIndex={0}
            onClick={onStartEdit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onStartEdit() }}
            className={`group text-sm text-foreground cursor-pointer px-2 py-0.5 -mx-2 rounded inline-flex items-center gap-1 transition-colors${isSaving ? ' opacity-50' : ' hover:bg-surface-sunken'}`}
          >
            {displayValue
              ? <span>{displayValue}</span>
              : <span className="text-foreground-faint">—</span>}
            {!isSaving && (
              <span className="opacity-0 group-hover:opacity-60 transition-opacity">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                  <path d="M2 8.5L8 2.5l1.5 1.5L3.5 10H2v-1.5z"/>
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EntryCellDisplay({
  displayValue, isSaving, onStartEdit,
}: {
  displayValue: ReactNode
  isSaving: boolean
  onStartEdit: () => void
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={onStartEdit}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onStartEdit() }}
      className={`group/cell cursor-pointer px-2 py-0.5 -mx-2 rounded inline-flex items-center gap-1 transition-colors${isSaving ? ' opacity-50' : ' hover:bg-surface-sunken'}`}
    >
      {displayValue}
      {!isSaving && (
        <span className="opacity-0 group-hover/cell:opacity-60 transition-opacity">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <path d="M2 8.5L8 2.5l1.5 1.5L3.5 10H2v-1.5z"/>
          </svg>
        </span>
      )}
    </div>
  )
}

type EntryCellProps = {
  fieldKey: string
  editingKey: string | null
  editValue: string
  savingKey: string | null
  displayValue: ReactNode
  inputType?: 'text' | 'date'
  editPrefix?: string
  onStartEdit: () => void
  onValueChange: (v: string) => void
  onCommit: (v: string) => void
  onCancel: () => void
}

function EntryCell({
  fieldKey, editingKey, editValue, savingKey, displayValue,
  inputType = 'text', editPrefix, onStartEdit, onValueChange, onCommit, onCancel,
}: EntryCellProps) {
  const isEditing = editingKey === fieldKey
  const isSaving = savingKey === fieldKey
  if (isEditing) {
    return (
      <div className="relative inline-flex items-center">
        {editPrefix && (
          <span className="absolute left-2 text-sm text-foreground-muted pointer-events-none">{editPrefix}</span>
        )}
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
          className={`text-sm px-2 py-1 rounded border border-border bg-surface outline-none focus:border-accent transition-colors${editPrefix ? ' pl-5' : ''}`}
          style={{ minWidth: inputType === 'date' ? '130px' : '100px' }}
        />
      </div>
    )
  }
  return <EntryCellDisplay displayValue={displayValue} isSaving={isSaving} onStartEdit={onStartEdit} />
}

type EntrySelectCellProps = {
  fieldKey: string
  editingKey: string | null
  editValue: string
  savingKey: string | null
  displayValue: ReactNode
  options: { value: string; label: string }[]
  onStartEdit: () => void
  onValueChange: (v: string) => void
  onCommit: (v: string) => void
  onCancel: () => void
}

function EntrySelectCell({
  fieldKey, editingKey, editValue, savingKey, displayValue,
  options, onStartEdit, onValueChange, onCommit, onCancel,
}: EntrySelectCellProps) {
  const isEditing = editingKey === fieldKey
  const isSaving = savingKey === fieldKey
  if (isEditing) {
    return (
      <select
        autoFocus
        value={editValue}
        onChange={e => { const v = e.target.value; onValueChange(v); onCommit(v) }}
        onBlur={() => onCancel()}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        className="text-sm px-2 py-1 rounded border border-border bg-surface outline-none focus:border-accent transition-colors"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  return <EntryCellDisplay displayValue={displayValue} isSaving={isSaving} onStartEdit={onStartEdit} />
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [property, setProperty] = useState<Property | null>(null)
  const [latestValuation, setLatestValuation] = useState<LatestValuation>(null)
  const [yieldStats, setYieldStats] = useState<YieldStats>(null)
  const [totalDebtCents, setTotalDebtCents] = useState(0)
  const [equityCents, setEquityCents] = useState<number | null>(null)
  const [lvrDecimal, setLvrDecimal] = useState<number | null>(null)
  const [loans, setLoans] = useState<LoanWithBalance[]>([])
  const [valuations, setValuations] = useState<PropertyValuation[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [avgMonthlyNetCents, setAvgMonthlyNetCents] = useState<number | null>(null)
  const [trends, setTrends] = useState<TrendPoint[]>([])

  const [tenancies, setTenancies] = useState<PropertyTenancy[]>([])
  const [managementAgents, setManagementAgents] = useState<PropertyManagementAgent[]>([])
  const [mgmtLoaded, setMgmtLoaded] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'management' | 'loans' | 'transactions'>('overview')

  // Inline per-field editing (Overview tab)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [fieldSaving, setFieldSaving] = useState<string | null>(null)

  // Insights / valuation form
  const [valDate, setValDate] = useState(todayIso)
  const [valDollars, setValDollars] = useState('')
  const [valSource, setValSource] = useState('manual_estimate')
  const [valReference, setValReference] = useState('')
  const [valNotes, setValNotes] = useState('')
  const [addingVal, setAddingVal] = useState(false)
  const [deleteValId, setDeleteValId] = useState<string | null>(null)
  const [deletingVal, setDeletingVal] = useState(false)

  // Transactions
  const [txMonth, setTxMonth] = useState(() => recentMonths(1)[0])
  const [entries, setEntries] = useState<PropertyLedger[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDate, setEntryDate] = useState('')
  const [entryDollars, setEntryDollars] = useState('')
  const [entryCategory, setEntryCategory] = useState<typeof MANUAL_CATEGORIES[number]>('rent')
  const [entryDesc, setEntryDesc] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<PropertyLedger | null>(null)
  const [deletingEntry, setDeletingEntry] = useState(false)

  // Inline per-cell correction (Transactions tab) — one cell across the whole
  // table may be in edit mode at a time, keyed `${entryId}:${field}`.
  const [editingEntryKey, setEditingEntryKey] = useState<string | null>(null)
  const [editEntryValue, setEditEntryValue] = useState('')
  const [savingEntryKey, setSavingEntryKey] = useState<string | null>(null)

  // Add tenancy modal
  const [showAddTenancy, setShowAddTenancy] = useState(false)
  const [tenLeaseType, setTenLeaseType] = useState<'fixed_term' | 'periodic'>('fixed_term')
  const [tenLeaseStart, setTenLeaseStart] = useState('')
  const [tenLeaseEnd, setTenLeaseEnd] = useState('')
  const [tenRent, setTenRent] = useState('')
  const [tenTenants, setTenTenants] = useState('')
  const [tenBond, setTenBond] = useState('')
  const [savingTenancy, setSavingTenancy] = useState(false)

  // Add agent modal
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [agentAgency, setAgentAgency] = useState('')
  const [agentContact, setAgentContact] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [agentEmail, setAgentEmail] = useState('')
  const [agentFee, setAgentFee] = useState('')
  const [agentCadence, setAgentCadence] = useState<StatementCadence>('monthly')
  const [agentFrom, setAgentFrom] = useState('')
  const [agentTo, setAgentTo] = useState('')
  const [savingAgent, setSavingAgent] = useState(false)

  // Mark as sold modal
  const [showSoldModal, setShowSoldModal] = useState(false)
  const [soldDate, setSoldDate] = useState('')
  const [soldPrice, setSoldPrice] = useState('')
  const [soldSettlement, setSoldSettlement] = useState('')
  const [markingSold, setMarkingSold] = useState(false)

  // Delete property modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingProperty, setDeletingProperty] = useState(false)


  const loadEntries = useCallback(async (signal: AbortSignal) => {
    setEntriesLoading(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}/entries?month=${txMonth}`, { signal })
      if (res.ok) {
        const data = await res.json() as { entries?: PropertyLedger[] }
        setEntries(data.entries ?? [])
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error('Failed to load transactions')
    } finally {
      setEntriesLoading(false)
    }
  }, [id, txMonth])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [propRes, loansRes, valsRes, entitiesRes, trendsRes, tenRes, agentRes] = await Promise.all([
          fetch(`/api/v1/properties/${id}`),
          fetch(`/api/v1/properties/${id}/loans`),
          fetch(`/api/v1/properties/${id}/valuations`),
          fetch('/api/v1/entities'),
          fetch(`/api/v1/properties/${id}/trends?months=12`),
          fetch(`/api/v1/properties/${id}/tenancies`),
          fetch(`/api/v1/properties/${id}/management-agents`),
        ])

        if (propRes.status === 401) { router.push('/login'); return }
        if (propRes.status === 404) { setNotFound(true); return }
        if (!propRes.ok) throw new Error()

        const propData = await propRes.json() as {
          property: Property
          latestValuation: LatestValuation
          yield: YieldStats
          totalDebtCents: number
          equityCents: number | null
          lvrDecimal: number | null
          totalAppreciationCents: number | null
        }
        setProperty(propData.property)
        setLatestValuation(propData.latestValuation)
        setYieldStats(propData.yield)
        setTotalDebtCents(propData.totalDebtCents ?? 0)
        setEquityCents(propData.equityCents ?? null)
        setLvrDecimal(propData.lvrDecimal ?? null)


        if (loansRes.ok) {
          const data = await loansRes.json() as { loans?: LoanWithBalance[] }
          setLoans(data.loans ?? [])
        }

        if (valsRes.ok) {
          const data = await valsRes.json() as { valuations?: PropertyValuation[] }
          setValuations(
            (data.valuations ?? []).sort((a, b) => b.valuedAt.localeCompare(a.valuedAt))
          )
        }

        if (entitiesRes.ok) {
          const data = await entitiesRes.json() as { entities?: Entity[] }
          setEntities(data.entities ?? [])
        }

        if (trendsRes.ok) {
          const data = await trendsRes.json() as { trends?: TrendPoint[]; avgMonthlyNetCents?: number | null }
          setAvgMonthlyNetCents(data.avgMonthlyNetCents ?? null)
          setTrends(data.trends ?? [])
        }

        if (tenRes.ok) {
          const data = await tenRes.json() as { tenancies?: PropertyTenancy[] }
          setTenancies(data.tenancies ?? [])
        }
        if (agentRes.ok) {
          const data = await agentRes.json() as { agents?: PropertyManagementAgent[] }
          setManagementAgents(data.agents ?? [])
        }
        setMgmtLoaded(true)
      } catch {
        toast.error('Failed to load property')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, router])

  useEffect(() => {
    if (loading) return
    const controller = new AbortController()
    loadEntries(controller.signal)
    return () => controller.abort()
  }, [txMonth, loading, loadEntries])

  const loadManagement = useCallback(async () => {
    if (mgmtLoaded) return
    try {
      const [tenRes, agentRes] = await Promise.all([
        fetch(`/api/v1/properties/${id}/tenancies`),
        fetch(`/api/v1/properties/${id}/management-agents`),
      ])
      if (tenRes.ok) {
        const data = await tenRes.json() as { tenancies?: PropertyTenancy[] }
        setTenancies(data.tenancies ?? [])
      }
      if (agentRes.ok) {
        const data = await agentRes.json() as { agents?: PropertyManagementAgent[] }
        setManagementAgents(data.agents ?? [])
      }
      setMgmtLoaded(true)
    } catch {
      toast.error('Failed to load management data')
    }
  }, [id, mgmtLoaded])

  async function patchProperty(updates: Record<string, unknown>) {
    const res = await fetch(`/api/v1/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error ?? 'Failed to save')
    }
    const { property: updated } = await res.json() as { property: Property }
    setProperty(updated)
  }

  function startPropEdit(field: string, currentValue: string | null | undefined) {
    setEditingField(field)
    setEditValue(currentValue ?? '')
  }

  async function commitPropField(field: string, value: string) {
    setEditingField(null)
    if (!property) return

    let updates: Record<string, unknown>
    if (field === 'nickname') {
      const n = value.trim() || null
      if (n === (property.nickname ?? null)) return
      updates = { nickname: n }
    } else if (field === 'address') {
      if (!value.trim() || value.trim() === property.address) return
      updates = { address: value.trim() }
    } else if (field === 'propertyType') {
      const t = value || null
      if (t === (property.propertyType ?? null)) return
      updates = { propertyType: t }
    } else if (field === 'entityId') {
      const e = value || null
      if (e === (property.entityId ?? null)) return
      updates = { entityId: e }
    } else if (field === 'startDate') {
      if (!value || value === property.startDate) return
      updates = { startDate: value }
    } else if (field === 'purchasePriceCents') {
      const raw = value.replace(/,/g, '')
      if (!raw) {
        if (property.purchasePriceCents === null) return
        updates = { purchasePriceCents: null }
      } else {
        const dollars = parseFloat(raw)
        if (isNaN(dollars)) { toast.error('Invalid purchase price'); return }
        const cents = Math.round(dollars * 100)
        if (cents === property.purchasePriceCents) return
        updates = { purchasePriceCents: cents }
      }
    } else {
      return
    }

    setFieldSaving(field)
    try {
      await patchProperty(updates)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setFieldSaving(null)
    }
  }

  async function handleAddValuation() {
    const parsedValue = parseFloat(valDollars.replace(/,/g, ''))
    if (!valDollars.trim() || isNaN(parsedValue) || parsedValue <= 0) {
      toast.error('Enter a valid value')
      return
    }
    setAddingVal(true)
    try {
      const combinedNotes = [
        valReference.trim() ? `Ref: ${valReference.trim()}` : '',
        valNotes.trim(),
      ].filter(Boolean).join(' — ') || null

      const res = await fetch(`/api/v1/properties/${id}/valuations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuedAt: valDate,
          valueCents: Math.round(parsedValue * 100),
          source: valSource,
          notes: combinedNotes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add valuation')
        return
      }
      const { valuation } = await res.json() as { valuation: PropertyValuation }
      const sorted = [valuation, ...valuations].sort((a, b) =>
        b.valuedAt.localeCompare(a.valuedAt)
      )
      setValuations(sorted)
      if (!latestValuation || valuation.valuedAt >= (latestValuation?.valuedAt ?? '')) {
        setLatestValuation({
          valueCents: valuation.valueCents,
          valuedAt: valuation.valuedAt,
          source: valuation.source,
        })
      }
      setValDollars('')
      setValReference('')
      setValNotes('')
      setValDate(todayIso())
      toast.success('Valuation added')
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setAddingVal(false)
    }
  }

  async function handleDeleteValuation(valuationId: string) {
    setDeletingVal(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}/valuations/${valuationId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { toast.error('Failed to delete'); return }
      const remaining = valuations.filter(v => v.id !== valuationId)
      setValuations(remaining)
      setLatestValuation(
        remaining.length > 0
          ? { valueCents: remaining[0].valueCents, valuedAt: remaining[0].valuedAt, source: remaining[0].source }
          : null
      )
      toast.success('Deleted')
    } finally {
      setDeletingVal(false)
      setDeleteValId(null)
    }
  }

  async function handleAddEntry() {
    const parsedAmount = parseFloat(entryDollars.replace(/,/g, ''))
    if (!entryDollars.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Invalid amount'); return
    }
    if (!entryDate) { toast.error('Date is required'); return }
    setSavingEntry(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItemDate: entryDate,
          amountCents: Math.round(parsedAmount * 100),
          category: entryCategory,
          description: entryDesc.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add transaction')
        return
      }
      const { entry } = await res.json() as { entry: PropertyLedger }
      if (entry.lineItemDate.slice(0, 7) === txMonth) {
        setEntries(prev => [entry, ...prev])
      }
      setEntryDate(''); setEntryDollars(''); setEntryDesc('')
      setShowAddEntry(false)
      toast.success('Transaction added')
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setSavingEntry(false)
    }
  }

  async function handleDeleteEntry() {
    if (!deleteEntryTarget) return
    setDeletingEntry(true)
    try {
      const res = await fetch(`/api/v1/ledger/${deleteEntryTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete transaction'); return }
      setEntries(prev => prev.filter(e => e.id !== deleteEntryTarget.id))
      setDeleteEntryTarget(null)
    } catch {
      toast.error('Failed to delete transaction')
    } finally {
      setDeletingEntry(false)
    }
  }

  function startEntryEdit(
    entry: PropertyLedger,
    field: 'lineItemDate' | 'amountCents' | 'category' | 'description'
  ) {
    setEditingEntryKey(`${entry.id}:${field}`)
    if (field === 'amountCents') setEditEntryValue((entry.amountCents / 100).toString())
    else if (field === 'description') setEditEntryValue(entry.description ?? '')
    else if (field === 'category') setEditEntryValue(entry.category)
    else setEditEntryValue(entry.lineItemDate)
  }

  async function commitEntryField(
    entry: PropertyLedger,
    field: 'lineItemDate' | 'amountCents' | 'category' | 'description',
    rawValue: string
  ) {
    setEditingEntryKey(null)

    let updates: Record<string, unknown>
    if (field === 'amountCents') {
      const raw = rawValue.replace(/,/g, '')
      const dollars = parseFloat(raw)
      if (!raw.trim() || isNaN(dollars) || dollars <= 0) { toast.error('Invalid amount'); return }
      const cents = Math.round(dollars * 100)
      if (cents === entry.amountCents) return
      updates = { amountCents: cents }
    } else if (field === 'lineItemDate') {
      if (!rawValue || rawValue === entry.lineItemDate) return
      updates = { lineItemDate: rawValue }
    } else if (field === 'category') {
      if (rawValue === entry.category) return
      updates = { category: rawValue }
    } else {
      const desc = rawValue.trim() || null
      if (desc === (entry.description ?? null)) return
      updates = { description: desc }
    }

    const key = `${entry.id}:${field}`
    setSavingEntryKey(key)
    try {
      const res = await fetch(`/api/v1/ledger/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to save')
        await loadEntries(new AbortController().signal)
        return
      }
      const { entry: updated } = await res.json() as { entry: PropertyLedger }
      // Append-only correction: the id changes. If it moved outside the currently
      // viewed month, drop it from the list rather than splice-replacing in place.
      if (updated.lineItemDate.slice(0, 7) === txMonth) {
        setEntries(prev => prev.map(e => e.id === entry.id ? updated : e))
      } else {
        setEntries(prev => prev.filter(e => e.id !== entry.id))
      }
      fetch(`/api/v1/properties/${id}/trends?months=12`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { trends?: TrendPoint[]; avgMonthlyNetCents?: number | null } | null) => {
          if (!data) return
          setAvgMonthlyNetCents(data.avgMonthlyNetCents ?? null)
          setTrends(data.trends ?? [])
        })
        .catch(() => {})
    } catch {
      toast.error('Network error — please try again')
      await loadEntries(new AbortController().signal)
    } finally {
      setSavingEntryKey(null)
    }
  }

  function cancelEntryEdit() {
    setEditingEntryKey(null)
  }

  async function handleAddTenancy() {
    const weeklyRentCents = Math.round(parseFloat(tenRent.replace(/,/g, '')) * 100)
    if (!tenLeaseStart || isNaN(weeklyRentCents) || weeklyRentCents <= 0) {
      toast.error('Lease start and weekly rent are required'); return
    }
    setSavingTenancy(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}/tenancies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseType: tenLeaseType,
          leaseStart: tenLeaseStart,
          leaseEnd: tenLeaseEnd || null,
          weeklyRentCents,
          tenants: tenTenants.trim() || null,
          bondCents: tenBond ? Math.round(parseFloat(tenBond.replace(/,/g, '')) * 100) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add tenancy'); return
      }
      const { tenancy } = await res.json() as { tenancy: PropertyTenancy }
      setTenancies(prev => [tenancy, ...prev])
      setShowAddTenancy(false)
      setTenLeaseStart(''); setTenLeaseEnd(''); setTenRent('')
      setTenTenants(''); setTenBond('')
      toast.success('Tenancy added')
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setSavingTenancy(false)
    }
  }

  async function handleDeleteTenancy(tenancyId: string) {
    if (!confirm('Delete this tenancy record?')) return
    try {
      const res = await fetch(`/api/v1/properties/${id}/tenancies/${tenancyId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { toast.error('Failed to delete tenancy'); return }
      setTenancies(prev => prev.filter(t => t.id !== tenancyId))
    } catch {
      toast.error('Failed to delete tenancy')
    }
  }

  async function handleAddAgent() {
    if (!agentAgency.trim() || !agentFrom) {
      toast.error('Agency name and effective from date are required'); return
    }
    if (agentFee && (isNaN(parseFloat(agentFee)) || parseFloat(agentFee) < 0 || parseFloat(agentFee) > 100)) {
      toast.error('Management fee must be a number between 0 and 100'); return
    }
    setSavingAgent(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}/management-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName: agentAgency.trim(),
          contactName: agentContact.trim() || null,
          phone: agentPhone.trim() || null,
          email: agentEmail.trim() || null,
          feePercent: agentFee || null,
          statementCadence: agentCadence,
          effectiveFrom: agentFrom,
          effectiveTo: agentTo || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add agent'); return
      }
      const { agent } = await res.json() as { agent: PropertyManagementAgent }
      setManagementAgents(prev => [agent, ...prev])
      setShowAddAgent(false)
      setAgentAgency(''); setAgentContact(''); setAgentPhone('')
      setAgentEmail(''); setAgentFee(''); setAgentFrom(''); setAgentTo('')
      toast.success('Agent added')
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setSavingAgent(false)
    }
  }

  async function handleDeleteAgent(agentId: string) {
    if (!confirm('Delete this management agent record?')) return
    try {
      const res = await fetch(`/api/v1/properties/${id}/management-agents/${agentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { toast.error('Failed to delete agent'); return }
      setManagementAgents(prev => prev.filter(a => a.id !== agentId))
    } catch {
      toast.error('Failed to delete agent')
    }
  }

  async function handleMarkAsSold() {
    const parsedPrice = parseFloat(soldPrice.replace(/,/g, ''))
    if (!soldDate || isNaN(parsedPrice) || parsedPrice <= 0) {
      toast.error('Sale date and price are required'); return
    }
    setMarkingSold(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleDate: soldDate,
          salePriceCents: Math.round(parsedPrice * 100),
          saleSettlementDate: soldSettlement || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to save'); return
      }
      const { property: updated } = await res.json() as { property: Property }
      setProperty(updated)
      setShowSoldModal(false)
      toast.success('Marked as sold')
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setMarkingSold(false)
    }
  }

  async function handleDeleteProperty() {
    setDeletingProperty(true)
    try {
      const res = await fetch(`/api/v1/properties/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete property'); return }
      router.push('/properties')
    } finally {
      setDeletingProperty(false)
      setShowDeleteModal(false)
    }
  }


  const entityName = property?.entityId
    ? (entities.find(e => e.id === property.entityId)?.name ?? null)
    : null

  const today = todayIso()
  const activeTenancy = tenancies
    .filter(t => !t.deletedAt && (!t.leaseEnd || t.leaseEnd >= today))
    .sort((a, b) => b.leaseStart.localeCompare(a.leaseStart))[0] ?? null
  const currentAgent = managementAgents
    .filter(a => !a.deletedAt && (!a.effectiveTo || a.effectiveTo >= today))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null

  const chartData = valuations
    .slice()
    .sort((a, b) => a.valuedAt.localeCompare(b.valuedAt))
    .map(v => ({ date: formatDate(v.valuedAt), value: v.valueCents / 100 }))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-foreground-muted">Loading…</span>
      </div>
    )
  }

  if (notFound || !property) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-foreground-muted">Property not found.</p>
        <Link href="/properties" className="text-accent text-sm hover:underline mt-2 inline-block">
          ← Back to properties
        </Link>
      </div>
    )
  }

  const months = recentMonths(12)
  const isSold = !!property.saleDate

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-foreground-muted">
        <Link href="/properties" className="hover:text-foreground transition-colors">Properties</Link>
        <span>›</span>
        <span className="text-foreground">{property.nickname ?? property.address}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-foreground">
              {property.nickname ?? property.address}
            </h1>
            {isSold && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-sunken text-foreground-muted border border-border">
                Sold
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-foreground-muted">
            {property.nickname && <span>{property.address}</span>}
            {entityName && (
              <span className="inline-flex items-center h-[22px] px-3 rounded-full text-[11px] font-medium uppercase tracking-[0.06em] bg-surface-sunken text-foreground-muted border border-border whitespace-nowrap">
                {entityName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2.5" aria-label="More options">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <circle cx="3" cy="8" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <circle cx="13" cy="8" r="1.5"/>
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px] p-1">
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold text-foreground-muted uppercase tracking-widest">Lifecycle</DropdownMenuLabel>
              {!isSold && (
                <DropdownMenuItem className="gap-2" onClick={() => setShowSoldModal(true)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="2,8 6,12 14,4"/>
                  </svg>
                  Mark as sold…
                </DropdownMenuItem>
              )}
              {!isSold && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="gap-2 text-negative focus:text-negative focus:bg-negative/8"
                onClick={() => setShowDeleteModal(true)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="2,4 14,4"/>
                  <path d="M5,4V2h6v2"/>
                  <rect x="3" y="4" width="10" height="10" rx="1"/>
                  <line x1="6" y1="7" x2="6" y2="11"/>
                  <line x1="10" y1="7" x2="10" y2="11"/>
                </svg>
                Delete property…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-4 gap-3 mb-7">
        <MetricTile
          label="Current value"
          value={latestValuation ? formatCents(latestValuation.valueCents) : '—'}
          foot={
            latestValuation
              ? <span className="text-xs text-foreground-muted">as of {formatDate(latestValuation.valuedAt)}</span>
              : undefined
          }
        />
        <MetricTile
          label="Gross yield"
          value={yieldStats ? `${yieldStats.grossPercent.toFixed(1)}%` : '—'}
          foot={yieldStats ? <span className="text-xs text-foreground-muted">{yieldStats.periodLabel}</span> : undefined}
        />
        <MetricTile
          label="Net cashflow"
          value={
            avgMonthlyNetCents !== null
              ? (avgMonthlyNetCents < 0 ? `−${formatCents(Math.abs(avgMonthlyNetCents))}` : formatCents(avgMonthlyNetCents))
              : '—'
          }
          valueClassName={avgMonthlyNetCents !== null && avgMonthlyNetCents < 0 ? 'text-red-500' : undefined}
          foot={avgMonthlyNetCents !== null ? <span className="text-xs text-foreground-muted">avg / month · 12 mo</span> : undefined}
        />
        <MetricTile
          label="LVR"
          value={lvrDecimal !== null ? `${Math.round(lvrDecimal * 100)}%` : '—'}
          foot={
            lvrDecimal !== null
              ? <LvrMeter value={lvrDecimal} className="w-full" />
              : undefined
          }
        />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex items-end gap-8 border-b border-border mb-7">
          {(['overview', 'insights', 'management', 'loans', 'transactions'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab)
                if (tab === 'management') loadManagement()
              }}
              className={`relative pb-3 pt-2 text-sm font-medium transition-colors capitalize${activeTab === tab ? ' text-foreground' : ' text-foreground-muted hover:text-foreground'}`}
            >
              {tab}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
            </button>
          ))}
        </div>

        {/* ===== OVERVIEW ===== */}
        {activeTab === 'overview' && (
        <div>
          <div className="grid gap-6" style={{ gridTemplateColumns: '1.2fr 1fr' }}>

            {/* Property details card */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Property details</h3>
              </div>
              <PropFieldRow
                label="Nickname" fieldKey="nickname"
                editingField={editingField} editValue={editValue} fieldSaving={fieldSaving}
                displayValue={property.nickname ?? null}
                onStartEdit={() => startPropEdit('nickname', property.nickname)}
                onValueChange={setEditValue}
                onCommit={v => commitPropField('nickname', v)}
                onCancel={() => setEditingField(null)}
              />
              <PropFieldRow
                label="Address" fieldKey="address"
                editingField={editingField} editValue={editValue} fieldSaving={fieldSaving}
                displayValue={property.address}
                onStartEdit={() => startPropEdit('address', property.address)}
                onValueChange={setEditValue}
                onCommit={v => commitPropField('address', v)}
                onCancel={() => setEditingField(null)}
              />
              <PropSelectRow
                label="Property type" fieldKey="propertyType"
                editingField={editingField} editValue={editValue} fieldSaving={fieldSaving}
                displayValue={PROPERTY_TYPES.find(t => t.value === property.propertyType)?.label ?? null}
                options={[
                  { value: '', label: '— Not specified —' },
                  ...PROPERTY_TYPES.map(t => ({ value: t.value, label: t.label })),
                ]}
                onStartEdit={() => startPropEdit('propertyType', property.propertyType ?? '')}
                onValueChange={setEditValue}
                onCommit={v => commitPropField('propertyType', v)}
                onCancel={() => setEditingField(null)}
              />
              <PropSelectRow
                label="Entity" fieldKey="entityId"
                editingField={editingField} editValue={editValue} fieldSaving={fieldSaving}
                displayValue={entityName}
                options={[
                  { value: '', label: 'None' },
                  ...entities.map(e => ({ value: e.id, label: e.name })),
                ]}
                onStartEdit={() => startPropEdit('entityId', property.entityId ?? '')}
                onValueChange={setEditValue}
                onCommit={v => commitPropField('entityId', v)}
                onCancel={() => setEditingField(null)}
              />
              <PropFieldRow
                label="Acquisition date" fieldKey="startDate"
                editingField={editingField} editValue={editValue} fieldSaving={fieldSaving}
                displayValue={formatDate(property.startDate)}
                inputType="date"
                onStartEdit={() => startPropEdit('startDate', property.startDate)}
                onValueChange={setEditValue}
                onCommit={v => commitPropField('startDate', v)}
                onCancel={() => setEditingField(null)}
              />
              <PropFieldRow
                label="Purchase price" fieldKey="purchasePriceCents"
                editingField={editingField} editValue={editValue} fieldSaving={fieldSaving}
                displayValue={property.purchasePriceCents ? formatCents(property.purchasePriceCents) : null}
                editPrefix="$"
                onStartEdit={() => startPropEdit('purchasePriceCents', property.purchasePriceCents ? String(property.purchasePriceCents / 100) : '')}
                onValueChange={setEditValue}
                onCommit={v => commitPropField('purchasePriceCents', v)}
                onCancel={() => setEditingField(null)}
              />
              <div className="grid items-center py-3 border-b border-rule" style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
                <div className="text-xs font-medium text-foreground-subtle">Managing agent</div>
                <div className="text-sm text-foreground">{currentAgent?.agencyName ?? <span className="text-foreground-faint">—</span>}</div>
              </div>
              <div className="grid items-center py-3 border-b border-rule" style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
                <div className="text-xs font-medium text-foreground-subtle">Lease end</div>
                <div className="text-sm text-foreground">{activeTenancy?.leaseEnd ? formatDate(activeTenancy.leaseEnd) : <span className="text-foreground-faint">—</span>}</div>
              </div>
              <div className="grid items-center py-3 border-b border-rule" style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
                <div className="text-xs font-medium text-foreground-subtle">Weekly rent</div>
                <div className="text-sm text-foreground">{activeTenancy ? formatCents(activeTenancy.weeklyRentCents) : <span className="text-foreground-faint">—</span>}</div>
              </div>
              <div className="grid items-center py-3 border-b border-rule" style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
                <div className="text-xs font-medium text-foreground-subtle">Sale date</div>
                <div className={`text-sm ${property.saleDate ? 'text-foreground' : 'text-foreground-faint'}`}>{property.saleDate ? formatDate(property.saleDate) : 'Not sold'}</div>
              </div>
              <div className="grid items-center py-3" style={{ gridTemplateColumns: '130px 1fr', gap: '16px' }}>
                <div className="text-xs font-medium text-foreground-subtle">Sale price</div>
                <div className="text-sm text-foreground">{property.salePriceCents ? formatCents(property.salePriceCents) : <span className="text-foreground-faint">—</span>}</div>
              </div>
            </div>

            {/* Equity position card */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-baseline justify-between mb-5">
                <h3 className="text-sm font-semibold text-foreground">Equity position</h3>
                {latestValuation && (
                  <span className="text-xs text-foreground-muted">{formatDate(latestValuation.valuedAt)}</span>
                )}
              </div>
              {!latestValuation ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-foreground-muted mb-1">No valuation recorded yet.</p>
                  <p className="text-xs text-foreground-muted">Add one in the Insights tab.</p>
                </div>
              ) : (
                <>
                  <div>
                    {[
                      {
                        label: 'Current value',
                        sub: latestValuation.source ? latestValuation.source.replace(/_/g, ' ') : null,
                        value: formatCents(latestValuation.valueCents),
                      },
                      {
                        label: 'Total debt',
                        sub: loans.length > 0 ? `${loans.length} loan${loans.length !== 1 ? 's' : ''} secured` : null,
                        value: totalDebtCents > 0 ? formatCents(totalDebtCents) : '—',
                        muted: true,
                      },
                      {
                        label: 'Net equity',
                        sub: equityCents !== null && latestValuation.valueCents > 0
                          ? `${Math.round((equityCents / latestValuation.valueCents) * 100)}% of value`
                          : null,
                        value: equityCents !== null ? formatCents(equityCents) : '—',
                        bold: true,
                      },
                    ].map(({ label, sub, value, muted, bold }) => (
                      <div key={label} className="grid gap-4 py-2.5 border-b border-rule last:border-0 text-sm" style={{ gridTemplateColumns: '1fr auto' }}>
                        <div>
                          <div className="text-xs text-foreground-muted font-medium">{label}</div>
                          {sub && <div className="text-xs text-foreground-muted mt-0.5">{sub}</div>}
                        </div>
                        <div className={`tabular-nums ${bold ? 'font-semibold text-foreground' : muted ? 'text-foreground-muted' : 'text-foreground'}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {lvrDecimal !== null && (
                    <div className="mt-5">
                      <div className="flex items-center justify-between text-xs text-foreground-muted mb-2">
                        <span>LVR</span>
                        <span className="text-foreground font-medium tabular-nums">{Math.round(lvrDecimal * 100)}%</span>
                      </div>
                      <LvrMeter value={lvrDecimal} />
                      <div className="flex justify-between text-[10px] text-foreground-muted mt-1.5">
                        <span>0%</span><span>60%</span><span>80%</span><span>100%</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ===== MANAGEMENT ===== */}
        {activeTab === 'management' && (
        <div>
          <div className="grid grid-cols-2 gap-5 items-start">
            {/* Tenancies */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Tenancy &amp; lease</h3>
                <Button size="sm" variant="outline" onClick={() => setShowAddTenancy(true)}>
                  + Add tenancy
                </Button>
              </div>
              {!mgmtLoaded ? (
                <p className="text-sm text-foreground-muted py-2">Loading…</p>
              ) : tenancies.length === 0 ? (
                <p className="text-sm text-foreground-muted">No tenancy records.</p>
              ) : (
                <div className="space-y-3">
                  {tenancies.map(t => {
                    const active = isActiveByDate(t.leaseEnd)
                    return (
                      <div
                        key={t.id}
                        className={`border rounded-lg p-4 ${active ? 'border-border' : 'border-dashed border-border'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {t.leaseType === 'fixed_term' ? 'Fixed term' : 'Periodic'}
                              </span>
                              {active ? (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-sunken text-foreground-muted border border-border">
                                  Ended
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-foreground-muted">
                              {formatDate(t.leaseStart)} – {t.leaseEnd ? formatDate(t.leaseEnd) : 'ongoing'}
                            </p>
                            {t.tenants && <p className="text-xs text-foreground-muted">{t.tenants}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-medium tabular-nums">
                              {formatCents(t.weeklyRentCents)}/wk
                            </p>
                            {t.bondCents && (
                              <p className="text-xs text-foreground-muted mt-0.5">Bond: {formatCents(t.bondCents)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end mt-3 pt-2 border-t border-rule">
                          <button
                            onClick={() => handleDeleteTenancy(t.id)}
                            className="text-xs text-foreground-muted hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Management agents */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Property management</h3>
                <Button size="sm" variant="outline" onClick={() => setShowAddAgent(true)}>
                  + Add agent
                </Button>
              </div>
              {!mgmtLoaded ? (
                <p className="text-sm text-foreground-muted py-2">Loading…</p>
              ) : managementAgents.length === 0 ? (
                <p className="text-sm text-foreground-muted">No management agent records.</p>
              ) : (
                <div className="space-y-3">
                  {managementAgents.map(a => {
                    const active = isActiveByDate(a.effectiveTo)
                    return (
                      <div
                        key={a.id}
                        className={`border rounded-lg p-4 ${active ? 'border-border' : 'border-dashed border-border'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">{a.agencyName}</span>
                              {active ? (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-sunken text-foreground-muted border border-border">
                                  Previous
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-foreground-muted">
                              From {formatDate(a.effectiveFrom)}
                              {a.effectiveTo ? ` – ${formatDate(a.effectiveTo)}` : ''}
                            </p>
                            {a.contactName && (
                              <p className="text-xs text-foreground-muted">
                                {a.contactName}{a.phone ? ` · ${a.phone}` : ''}
                              </p>
                            )}
                            <p className="text-xs text-foreground-muted">
                              {CADENCE_LABELS[a.statementCadence]} statements
                              {a.feePercent ? ` · ${a.feePercent}% management fee` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3 pt-2 border-t border-rule">
                          <button
                            onClick={() => handleDeleteAgent(a.id)}
                            className="text-xs text-foreground-muted hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ===== LOANS ===== */}
        {activeTab === 'loans' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-foreground-muted uppercase tracking-wide font-medium">
              Loans secured by this property
            </p>
            <Link href="/loans" className="text-xs text-foreground-muted hover:text-accent transition-colors">
              Open Loans section →
            </Link>
          </div>
          {loans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-foreground-muted mb-3">No loans linked to this property.</p>
              <Button size="sm" variant="outline" onClick={() => router.push('/loans/new')}>
                + Add a loan
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {loans.map(loan => {
                const loanEntityName = loan.entityId
                  ? (entities.find(e => e.id === loan.entityId)?.name ?? null)
                  : null
                return (
                  <div key={loan.id} className="bg-surface border border-border rounded-lg p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-medium text-foreground">{loan.nickname ?? loan.lender}</p>
                        <div className="flex items-center gap-1.5 text-xs text-foreground-muted mt-0.5 flex-wrap">
                          <span>{loan.lender}</span>
                          {loan.accountReference && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-current opacity-40 inline-block" />
                              <span>acct ending {loan.accountReference.slice(-4)}</span>
                            </>
                          )}
                          {loan.loanType && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-current opacity-40 inline-block" />
                              <span>{loan.loanType === 'interest_only' ? 'Interest only' : 'Principal & interest'}
                                {loan.loanType === 'interest_only' && loan.ioEndDate ? ` · IO ends ${formatDate(loan.ioEndDate)}` : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => router.push(`/loans/${loan.id}`)}>
                        View in Loans →
                      </Button>
                    </div>
                    <div>
                      {[
                        {
                          k: 'Current balance',
                          v: loan.latestBalance
                            ? `${formatCents(loan.latestBalance.balanceCents)}`
                            : '—',
                          sub: loan.latestBalance ? `as of ${formatDate(loan.latestBalance.recordedAt)}` : null,
                        },
                        {
                          k: 'Interest rate',
                          v: loan.interestRate ? `${loan.interestRate}%` : '—',
                          sub: loan.rateType ? (loan.rateType === 'variable' ? 'variable' : 'fixed') : null,
                        },
                        {
                          k: 'Entity',
                          v: loanEntityName ?? '—',
                          sub: null,
                        },
                      ].map(({ k, v, sub }) => (
                        <div key={k} className="grid gap-4 py-2 border-b border-rule last:border-0 text-sm" style={{ gridTemplateColumns: '140px 1fr' }}>
                          <span className="text-xs text-foreground-muted font-medium">{k}</span>
                          <span className="text-foreground tabular-nums">
                            {v}
                            {sub && <span className="text-xs text-foreground-muted ml-2">{sub}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {equityCents !== null && equityCents > 0 && (
                <div className="flex items-center justify-between py-3 px-4 bg-surface border border-dashed border-border rounded-lg text-sm">
                  <span className="text-foreground-muted">
                    Equity available: <span className="font-semibold text-foreground">{formatCents(equityCents)}</span>
                  </span>
                  <button
                    className="text-xs text-foreground-muted hover:text-accent transition-colors"
                    onClick={() => router.push('/loans/new')}
                  >
                    + Add another loan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* ===== TRANSACTIONS ===== */}
        {activeTab === 'transactions' && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <select
                className="h-8 rounded-md border border-input bg-surface px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-shrink-0"
                value={txMonth}
                onChange={e => setTxMonth(e.target.value)}
              >
                {months.map(m => {
                  const [y, mo] = m.split('-')
                  const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-AU', {
                    month: 'long', year: 'numeric',
                  })
                  return <option key={m} value={m}>{label}</option>
                })}
              </select>
              {entries.length > 0 && (() => {
                const inCents  = entries.filter(e => e.category === 'rent' || e.category === 'other_income').reduce((s, e) => s + e.amountCents, 0)
                const outCents = entries.filter(e => e.category !== 'rent' && e.category !== 'other_income').reduce((s, e) => s + e.amountCents, 0)
                const netCents = inCents - outCents
                return (
                  <span className="text-xs text-foreground-muted inline-flex items-center gap-1.5 flex-wrap">
                    <span className="text-foreground-subtle">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
                    <span className="w-1 h-1 rounded-full bg-foreground-subtle inline-block" />
                    <span className="text-green-700">+{formatCents(inCents)}</span>
                    <span className="w-1 h-1 rounded-full bg-foreground-subtle inline-block" />
                    <span>−{formatCents(outCents)}</span>
                    <span className="w-1 h-1 rounded-full bg-foreground-subtle inline-block" />
                    <span className="text-foreground-subtle">net</span>{' '}
                    <span className={`font-medium text-foreground`}>{netCents >= 0 ? `+${formatCents(netCents)}` : `−${formatCents(Math.abs(netCents))}`}</span>
                  </span>
                )
              })()}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/upload"
                className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-foreground-muted rounded-md hover:text-foreground hover:bg-surface-sunken transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M3 8.5V10h6V8.5"/><path d="M6 2.5v5M4 4.5l2-2 2 2"/>
                </svg>
                Import from PM statement
              </Link>
              <span className="w-px h-4 bg-border" />
              <Button size="sm" variant="ghost" onClick={() => setShowAddEntry(v => !v)}>
                {showAddEntry ? 'Cancel' : '+ Add entry'}
              </Button>
            </div>
          </div>

          {showAddEntry && (
            <div className="bg-surface border border-border rounded-lg p-5 mb-4">
              <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-3">
                New transaction
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entry-date">Date</Label>
                  <Input
                    id="entry-date" type="date"
                    value={entryDate}
                    onChange={e => setEntryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-amount">Amount ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                    <Input
                      id="entry-amount" type="text" inputMode="decimal"
                      placeholder="1,200" className="pl-7"
                      value={entryDollars}
                      onChange={e => setEntryDollars(e.target.value)}
                    />
                  </div>
                </div>
                <SelectField
                  id="entry-category" label="Category"
                  value={entryCategory}
                  onChange={v => setEntryCategory(v as typeof MANUAL_CATEGORIES[number])}
                >
                  {MANUAL_CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </SelectField>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-desc">
                    Description <span className="font-normal text-foreground-muted">(optional)</span>
                  </Label>
                  <Input
                    id="entry-desc" placeholder="e.g. Water bill"
                    value={entryDesc}
                    onChange={e => setEntryDesc(e.target.value)}
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleAddEntry}
                disabled={savingEntry || !entryDate || !entryDollars.trim()}
              >
                {savingEntry ? 'Adding…' : 'Add transaction'}
              </Button>
            </div>
          )}

          {entriesLoading ? (
            <div className="text-center py-8">
              <span className="text-sm text-foreground-muted">Loading…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-foreground-muted">No transactions for this month.</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken border-b border-border">
                    <th className="text-left font-medium text-foreground-subtle text-[11px] uppercase tracking-[0.06em] py-2 px-4">Date</th>
                    <th className="text-left font-medium text-foreground-subtle text-[11px] uppercase tracking-[0.06em] py-2 px-4">Category</th>
                    <th className="text-left font-medium text-foreground-subtle text-[11px] uppercase tracking-[0.06em] py-2 px-4">Description</th>
                    <th className="text-right font-medium text-foreground-subtle text-[11px] uppercase tracking-[0.06em] py-2 px-4">Amount</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id} className="border-b border-rule last:border-b-0 group">
                      <td className="py-2.5 px-4 text-foreground-muted">
                        <EntryCell
                          fieldKey={`${entry.id}:lineItemDate`}
                          editingKey={editingEntryKey}
                          editValue={editEntryValue}
                          savingKey={savingEntryKey}
                          displayValue={formatDate(entry.lineItemDate)}
                          inputType="date"
                          onStartEdit={() => startEntryEdit(entry, 'lineItemDate')}
                          onValueChange={setEditEntryValue}
                          onCommit={v => commitEntryField(entry, 'lineItemDate', v)}
                          onCancel={cancelEntryEdit}
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <EntrySelectCell
                          fieldKey={`${entry.id}:category`}
                          editingKey={editingEntryKey}
                          editValue={editEntryValue}
                          savingKey={savingEntryKey}
                          displayValue={
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: CATEGORY_COLORS[entry.category] ?? 'hsl(var(--muted-foreground))' }}
                              />
                              {CATEGORY_LABELS[entry.category] ?? entry.category}
                            </span>
                          }
                          options={CORRECTION_CATEGORY_OPTIONS}
                          onStartEdit={() => startEntryEdit(entry, 'category')}
                          onValueChange={setEditEntryValue}
                          onCommit={v => commitEntryField(entry, 'category', v)}
                          onCancel={cancelEntryEdit}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-foreground-muted">
                        <EntryCell
                          fieldKey={`${entry.id}:description`}
                          editingKey={editingEntryKey}
                          editValue={editEntryValue}
                          savingKey={savingEntryKey}
                          displayValue={entry.description ?? <span className="text-foreground-faint">—</span>}
                          onStartEdit={() => startEntryEdit(entry, 'description')}
                          onValueChange={setEditEntryValue}
                          onCommit={v => commitEntryField(entry, 'description', v)}
                          onCancel={cancelEntryEdit}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium">
                        <EntryCell
                          fieldKey={`${entry.id}:amountCents`}
                          editingKey={editingEntryKey}
                          editValue={editEntryValue}
                          savingKey={savingEntryKey}
                          displayValue={
                            (entry.category === 'rent' || entry.category === 'other_income')
                              ? <span className="text-green-700">+{formatCents(entry.amountCents)}</span>
                              : <span>−{formatCents(entry.amountCents)}</span>
                          }
                          editPrefix="$"
                          onStartEdit={() => startEntryEdit(entry, 'amountCents')}
                          onValueChange={setEditEntryValue}
                          onCommit={v => commitEntryField(entry, 'amountCents', v)}
                          onCancel={cancelEntryEdit}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground transition-opacity text-base leading-none px-1"
                              aria-label="Row actions"
                            >⋯</button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[200px]">
                            {entry.sourceDocumentId && (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link href={`/uploads/${entry.sourceDocumentId}`}>View source upload</Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <p className="px-2 pt-1 pb-1.5 text-[10px] leading-snug text-foreground-muted">
                                  For a single wrong value, correct it instead of deleting the whole transaction.
                                </p>
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-negative focus:text-negative focus:bg-negative/8"
                              onClick={() => setDeleteEntryTarget(entry)}
                            >
                              Delete transaction
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* ===== INSIGHTS ===== */}
        {activeTab === 'insights' && (
        <div>

          {/* Cashflow chart section */}
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-3">Cashflow · last 12 months</p>
          <div className="bg-surface border border-border rounded-lg p-5 mb-7">
            <div className="flex items-start justify-between mb-4">
              <span className="text-sm font-semibold text-foreground">Net cashflow · monthly</span>
              <div className="flex items-center gap-4 text-xs text-foreground-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(152 38% 30% / 0.55)' }} />
                  Rent
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(152 38% 45% / 0.55)' }} />
                  Other income
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(14 58% 42% / 0.5)' }} />
                  Expenses
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(32 6% 38% / 0.45)' }} />
                  Loan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-0.5" style={{ background: 'hsl(188 32% 32%)' }} />
                  Net
                </span>
              </div>
            </div>
            {trends.length === 0 ? (
              <p className="text-sm text-foreground-muted py-6 text-center">No cashflow data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={trends.map(t => ({
                    month:        new Date(t.month + '-01').toLocaleDateString('en-AU', { month: 'short' }),
                    rent:         t.hasData ? t.rentCents / 100 : null,
                    otherIncome:  t.hasData ? t.otherIncomeCents / 100 : null,
                    expenses:     t.hasData ? -(t.expensesCents / 100) : null,
                    mortgage:     t.hasData ? -(t.mortgageCents / 100) : null,
                    net:          t.hasData ? t.netCents / 100 : null,
                  }))}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  barCategoryGap="30%"
                >
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                  <Tooltip
                    formatter={(v: unknown, name: string) => {
                      const val = typeof v === 'number' ? Math.abs(v) : 0
                      const labels: Record<string, string> = { rent: 'Rent', otherIncome: 'Other income', expenses: 'Expenses', mortgage: 'Loan', net: 'Net' }
                      return [formatCents(val * 100), labels[name] ?? name]
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))' }}
                  />
                  <Bar dataKey="rent" stackId="pos" fill="hsl(152 38% 30% / 0.55)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="otherIncome" stackId="pos" fill="hsl(152 38% 45% / 0.55)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" stackId="neg" fill="hsl(14 58% 42% / 0.5)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="mortgage" stackId="neg" fill="hsl(32 6% 38% / 0.45)" radius={[0, 0, 2, 2]} />
                  <Line dataKey="net" type="monotone" stroke="hsl(188 32% 32%)" strokeWidth={1.8} dot={{ r: 2.4, fill: 'hsl(188 32% 32%)', strokeWidth: 0 }} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Valuation summary strip */}
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-3">Valuation summary</p>
          {(() => {
            const growthPercent = latestValuation && property.purchasePriceCents
              ? ((latestValuation.valueCents - property.purchasePriceCents) / property.purchasePriceCents) * 100
              : null

            const yearsHeld = property.startDate
              ? (new Date().getTime() - new Date(property.startDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
              : null

            const monthsAgoVal = latestValuation
              ? Math.floor((new Date().getTime() - new Date(latestValuation.valuedAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
              : null

            const lastValLabel = monthsAgoVal === null ? '—'
              : monthsAgoVal === 0 ? 'This month'
              : monthsAgoVal === 1 ? '1 month ago'
              : monthsAgoVal < 12 ? `${monthsAgoVal} months ago`
              : monthsAgoVal < 24 ? '1 year ago'
              : `${Math.floor(monthsAgoVal / 12)} years ago`

            const isRecent = monthsAgoVal !== null && monthsAgoVal <= 3

            return (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <MetricTile
                  label="Current value"
                  value={latestValuation ? formatCents(latestValuation.valueCents) : '—'}
                  foot={latestValuation ? <span className="text-xs text-foreground-muted">as of {formatDate(latestValuation.valuedAt)}</span> : undefined}
                />
                <MetricTile
                  label="Growth · since purchase"
                  value={growthPercent !== null ? `${growthPercent >= 0 ? '+' : '−'}${Math.abs(growthPercent).toFixed(1)}%` : '—'}
                  valueClassName={growthPercent !== null && growthPercent < 0 ? 'text-negative' : growthPercent !== null ? 'text-positive' : undefined}
                  foot={
                    property.purchasePriceCents && latestValuation
                      ? <span className="text-xs text-foreground-muted">
                          {formatCents(property.purchasePriceCents)} → {formatCents(latestValuation.valueCents)}
                          {yearsHeld !== null ? ` · ${yearsHeld < 1 ? '<1 yr' : `${Math.floor(yearsHeld)} yr${Math.floor(yearsHeld) !== 1 ? 's' : ''}`}` : ''}
                        </span>
                      : undefined
                  }
                />
                <MetricTile
                  label="Last valuation"
                  value={lastValLabel}
                  valueClassName="text-base"
                  foot={
                    latestValuation
                      ? <span className="text-xs text-foreground-muted inline-flex items-center gap-1.5">
                          {formatDate(latestValuation.valuedAt)}
                          {isRecent && (
                            <span className="inline-flex items-center h-[18px] px-1.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-positive-soft text-positive">
                              Recent
                            </span>
                          )}
                        </span>
                      : undefined
                  }
                />
              </div>
            )
          })()}

          {/* Valuation line chart */}
          {chartData.length >= 2 && (
            <div className="bg-surface border border-border rounded-lg p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Value over time</span>
                <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <span className="inline-block w-2.5 h-0.5" style={{ background: 'hsl(188 32% 32%)' }} />
                  Valuation
                </span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => typeof v === 'number' ? [formatCents(v * 100), 'Value'] : [String(v), 'Value']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--surface))',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(188 32% 32%)"
                    strokeWidth={1.8}
                    dot={{ r: 3, fill: 'hsl(188 32% 32%)', strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Valuation history table */}
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-3">Valuation history</p>
          <div className="bg-surface border border-border rounded-lg overflow-hidden mb-5">
            {valuations.length === 0 ? (
              <p className="text-sm text-foreground-muted p-5">No valuations recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background">
                    <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Date</th>
                    <th className="text-left font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Source</th>
                    <th className="text-right font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Value</th>
                    <th className="text-right font-medium text-foreground-muted text-xs uppercase tracking-wide py-2.5 px-4">Change</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {valuations.map((v, i) => {
                    const prev = valuations[i + 1]
                    const changeCents = prev ? v.valueCents - prev.valueCents : null
                    return (
                      <tr key={v.id} className="border-b border-rule last:border-b-0 group">
                        <td className="py-2.5 px-4 text-foreground-muted">{formatDate(v.valuedAt)}</td>
                        <td className="py-2.5 px-4 text-foreground-muted capitalize">{v.source ? v.source.replace(/_/g, ' ') : 'Manual entry'}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-medium">{formatCents(v.valueCents)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-xs">
                          {changeCents !== null ? (
                            <span className={changeCents >= 0 ? 'text-green-700' : 'text-red-600'}>
                              {changeCents >= 0 ? '+' : '−'}{formatCents(Math.abs(changeCents))}
                            </span>
                          ) : (
                            <span className="text-foreground-muted">baseline</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {deleteValId === v.id ? (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleDeleteValuation(v.id)} disabled={deletingVal} className="text-xs text-red-600 hover:text-red-700">
                                {deletingVal ? 'Deleting…' : 'Delete'}
                              </button>
                              <button onClick={() => setDeleteValId(null)} className="text-xs text-foreground-muted hover:text-foreground">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteValId(v.id)}
                              className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground transition-opacity text-base leading-none"
                              title="Delete valuation"
                            >⋯</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Add valuation form */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h4 className="text-sm font-semibold text-foreground">Add a new valuation</h4>
              <span className="text-xs text-foreground-muted">Typically once every 6–12 months</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1.5">
                <Label htmlFor="val-date">Date</Label>
                <Input id="val-date" type="date" value={valDate} onChange={e => setValDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-amount">Value ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                  <Input id="val-amount" type="text" inputMode="decimal" placeholder="920,000" className="pl-7" value={valDollars} onChange={e => setValDollars(e.target.value)} />
                </div>
              </div>
              <SelectField id="val-source" label="Source" value={valSource} onChange={setValSource}>
                {VALUATION_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectField>
              <div className="space-y-1.5">
                <Label htmlFor="val-reference">Reference <span className="font-normal text-foreground-muted">(optional)</span></Label>
                <Input id="val-reference" placeholder="e.g. Bank val report #1234" value={valReference} onChange={e => setValReference(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5 mb-3">
              <Label htmlFor="val-notes">Notes <span className="font-normal text-foreground-muted">(optional)</span></Label>
              <Input id="val-notes" placeholder="e.g. Comparable sale: 18 Elm Street, $935k March 2026" value={valNotes} onChange={e => setValNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddValuation} disabled={addingVal || !valDollars.trim() || !valDate}>
                {addingVal ? 'Saving…' : 'Save valuation'}
              </Button>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ===== DIALOGS ===== */}

      {/* Mark as sold */}
      <Dialog open={showSoldModal} onOpenChange={setShowSoldModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as sold</DialogTitle>
            <DialogDescription>
              Record the sale details for this property.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="sold-date">Sale date</Label>
              <Input
                id="sold-date" type="date"
                value={soldDate}
                onChange={e => setSoldDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sold-price">Sale price ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                <Input
                  id="sold-price" type="text" inputMode="decimal"
                  placeholder="950,000" className="pl-7"
                  value={soldPrice}
                  onChange={e => setSoldPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sold-settlement">
                Settlement date <span className="font-normal text-foreground-muted">(optional)</span>
              </Label>
              <Input
                id="sold-settlement" type="date"
                value={soldSettlement}
                onChange={e => setSoldSettlement(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleMarkAsSold} disabled={markingSold || !soldDate || !soldPrice.trim()}>
              {markingSold ? 'Saving…' : 'Mark as sold'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete property */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete property</DialogTitle>
            <DialogDescription>
              This will permanently delete the property and all associated data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteProperty}
              disabled={deletingProperty}
            >
              {deletingProperty ? 'Deleting…' : 'Delete property'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete transaction */}
      <Dialog open={deleteEntryTarget !== null} onOpenChange={open => { if (!open) setDeleteEntryTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transaction</DialogTitle>
            <DialogDescription>
              This will permanently delete this transaction. This cannot be undone.
              {deleteEntryTarget?.sourceDocumentId && (
                <> Re-uploading the source statement may re-import this transaction.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteEntry}
              disabled={deletingEntry}
            >
              {deletingEntry ? 'Deleting…' : 'Delete transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add tenancy */}
      <Dialog open={showAddTenancy} onOpenChange={setShowAddTenancy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tenancy</DialogTitle>
            <DialogDescription>Record a lease agreement for this property.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <SelectField
              id="ten-type" label="Lease type"
              value={tenLeaseType}
              onChange={v => setTenLeaseType(v as 'fixed_term' | 'periodic')}
            >
              <option value="fixed_term">Fixed term</option>
              <option value="periodic">Periodic</option>
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ten-start">Lease start</Label>
                <Input
                  id="ten-start" type="date"
                  value={tenLeaseStart}
                  onChange={e => setTenLeaseStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ten-end">
                  Lease end <span className="font-normal text-foreground-muted">(optional)</span>
                </Label>
                <Input
                  id="ten-end" type="date"
                  value={tenLeaseEnd}
                  onChange={e => setTenLeaseEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten-rent">Weekly rent ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                <Input
                  id="ten-rent" type="text" inputMode="decimal"
                  placeholder="450" className="pl-7"
                  value={tenRent}
                  onChange={e => setTenRent(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten-tenants">
                Tenants <span className="font-normal text-foreground-muted">(optional)</span>
              </Label>
              <Input
                id="ten-tenants" placeholder="e.g. John & Jane Smith"
                value={tenTenants}
                onChange={e => setTenTenants(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten-bond">
                Bond ($) <span className="font-normal text-foreground-muted">(optional)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted text-sm">$</span>
                <Input
                  id="ten-bond" type="text" inputMode="decimal"
                  placeholder="1,800" className="pl-7"
                  value={tenBond}
                  onChange={e => setTenBond(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAddTenancy}
              disabled={savingTenancy || !tenLeaseStart || !tenRent.trim()}
            >
              {savingTenancy ? 'Adding…' : 'Add tenancy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add management agent */}
      <Dialog open={showAddAgent} onOpenChange={setShowAddAgent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add management agent</DialogTitle>
            <DialogDescription>Record a property management agreement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="agent-agency">Agency name</Label>
              <Input
                id="agent-agency" placeholder="e.g. Ray White Property Management"
                value={agentAgency}
                onChange={e => setAgentAgency(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-from">Effective from</Label>
                <Input
                  id="agent-from" type="date"
                  value={agentFrom}
                  onChange={e => setAgentFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-to">
                  Effective to <span className="font-normal text-foreground-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-to" type="date"
                  value={agentTo}
                  onChange={e => setAgentTo(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                id="agent-cadence" label="Statement cadence"
                value={agentCadence}
                onChange={v => setAgentCadence(v as StatementCadence)}
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="bi_monthly">Bi-monthly</option>
              </SelectField>
              <div className="space-y-1.5">
                <Label htmlFor="agent-fee">
                  Management fee (%) <span className="font-normal text-foreground-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-fee" type="text" inputMode="decimal"
                  placeholder="8.5"
                  value={agentFee}
                  onChange={e => setAgentFee(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-contact">
                Contact name <span className="font-normal text-foreground-muted">(optional)</span>
              </Label>
              <Input
                id="agent-contact" placeholder="e.g. Sarah Jones"
                value={agentContact}
                onChange={e => setAgentContact(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-phone">
                  Phone <span className="font-normal text-foreground-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-phone" type="tel" placeholder="0412 345 678"
                  value={agentPhone}
                  onChange={e => setAgentPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-email">
                  Email <span className="font-normal text-foreground-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-email" type="email" placeholder="agent@agency.com.au"
                  value={agentEmail}
                  onChange={e => setAgentEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAddAgent}
              disabled={savingAgent || !agentAgency.trim() || !agentFrom}
            >
              {savingAgent ? 'Adding…' : 'Add agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
