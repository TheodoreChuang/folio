'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCents, formatCentsEntered } from '@/lib/format'
import type { PersonalBudgetItem, BudgetItemType, BudgetItemFrequency } from '@/db/schema'

// ── Types ──────────────────────────────────────────────────────────────────

type EnrichedItem = PersonalBudgetItem & { monthlyCents: number }
type View = 'monthly' | 'annual' | 'both'

type Summary = {
  totalIncomeMonthlyCents: number
  totalExpensesMonthlyCents: number
  surplusMonthlyCents: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const MONTHLY_FACTOR: Record<BudgetItemFrequency, number> = {
  weekly:      52 / 12,
  fortnightly: 26 / 12,
  monthly:     1,
  annual:      1 / 12,
}

const FREQ_ABBR: Record<BudgetItemFrequency, string> = {
  weekly:      '/ wk',
  fortnightly: '/ fn',
  monthly:     '/ mo',
  annual:      '/ yr',
}

const FREQ_OPTIONS: { value: BudgetItemFrequency; label: string }[] = [
  { value: 'weekly',      label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'annual',      label: 'Annual' },
]

function toMonthlyLocal(amountCents: number, frequency: BudgetItemFrequency): number {
  return Math.round(amountCents * MONTHLY_FACTOR[frequency])
}

function recomputeSummary(items: EnrichedItem[]): Summary {
  let totalIncomeMonthlyCents = 0
  let totalExpensesMonthlyCents = 0
  for (const item of items) {
    if (item.type === 'income') totalIncomeMonthlyCents += item.monthlyCents
    else totalExpensesMonthlyCents += item.monthlyCents
  }
  return {
    totalIncomeMonthlyCents,
    totalExpensesMonthlyCents,
    surplusMonthlyCents: totalIncomeMonthlyCents - totalExpensesMonthlyCents,
  }
}

// ── Trash icon ─────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 3h10M4.5 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M10.5 3l-.6 8a1 1 0 0 1-1 .9H4.1a1 1 0 0 1-1-.9L2.5 3" />
    </svg>
  )
}

// ── Frequency segmented toggle ─────────────────────────────────────────────

function FreqToggle({
  value,
  onChange,
}: {
  value: BudgetItemFrequency
  onChange: (v: BudgetItemFrequency) => void
}) {
  return (
    <div className="flex w-full items-center gap-0.5 p-[3px] bg-white border border-border rounded-[7px]">
      {FREQ_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'flex-1 h-7 text-sm font-medium rounded-[5px] transition-colors',
            opt.value === value
              ? 'bg-accent-light text-accent'
              : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Inline form ────────────────────────────────────────────────────────────

function ItemForm({
  initialName = '',
  initialAmountDollars = '',
  initialFrequency = 'monthly' as BudgetItemFrequency,
  initialDetail = '',
  isEditing = false,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  initialName?: string
  initialAmountDollars?: string
  initialFrequency?: BudgetItemFrequency
  initialDetail?: string
  isEditing?: boolean
  onSave: (name: string, amountCents: number, frequency: BudgetItemFrequency, detail: string) => void
  onCancel: () => void
  onDelete?: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initialName)
  const [amountDollars, setAmountDollars] = useState(initialAmountDollars)
  const [frequency, setFrequency] = useState<BudgetItemFrequency>(initialFrequency)
  const [detail, setDetail] = useState(initialDetail)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const amountCents = Math.round(parseFloat(amountDollars || '0') * 100)
  const previewMonthly = amountCents > 0 ? toMonthlyLocal(amountCents, frequency) : null

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('Name is required'); return }
    if (amountCents <= 0) { toast.error('Amount must be greater than zero'); return }
    onSave(trimmed, amountCents, frequency, detail.trim())
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 my-1">
      {/* Row 1: Name + Amount */}
      <div className="grid grid-cols-[1fr_auto] gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-semibold text-muted uppercase tracking-widest mb-1">Name</label>
          <Input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="e.g. Employment income"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted uppercase tracking-widest mb-1">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amountDollars}
              onChange={e => setAmountDollars(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="0"
              className="pl-7 w-32"
            />
          </div>
        </div>
      </div>

      {/* Row 2: Detail (optional) */}
      <div className="mb-3">
        <label className="block text-[10px] font-semibold text-muted uppercase tracking-widest mb-1">
          Detail <span className="normal-case font-normal">(optional)</span>
        </label>
        <Input
          value={detail}
          onChange={e => setDetail(e.target.value)}
          placeholder="e.g. Theo · base + super"
        />
      </div>

      {/* Row 3: Frequency */}
      <div className="mb-3">
        <label className="block text-[10px] font-semibold text-muted uppercase tracking-widest mb-1">Frequency</label>
        <FreqToggle value={frequency} onChange={setFrequency} />
      </div>

      {/* Preview */}
      {previewMonthly !== null && (
        <p className="text-xs text-muted mb-3">
          ≈ {formatCents(previewMonthly)} / mo · {formatCents(previewMonthly * 12)} / yr
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="flex items-center gap-1.5 text-sm text-negative hover:opacity-75 transition-opacity"
          >
            <TrashIcon />
            Delete
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Edit glyph ─────────────────────────────────────────────────────────────

function EditGlyph({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Edit"
      className="text-muted hover:text-ink transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M2 8.5L8 2.5l1.5 1.5L3.5 10H2v-1.5z" />
      </svg>
    </button>
  )
}

// ── View toggle ────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { value: View; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual',  label: 'Annual' },
    { value: 'both',    label: 'Both' },
  ]
  return (
    <div className="inline-flex items-center gap-0.5 p-[3px] bg-surface-sunken border border-border rounded-[7px]">
      {opts.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'px-3 h-[26px] text-xs font-medium rounded-[5px] transition-colors',
            opt.value === view
              ? 'bg-white text-ink shadow-[0_1px_0_hsl(36_12%_90%)]'
              : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Column count helper ───────────────────────────────────────────────────

function gridCols(view: View) {
  if (view === 'both') return 'grid-cols-[1fr_auto_auto_auto_24px]'
  return 'grid-cols-[1fr_auto_auto_24px]'
}

// ── Table header row ────────────────────────────────────────────────────────

function TableHeader({ view }: { view: View }) {
  return (
    <div className={`grid ${gridCols(view)} gap-x-6 px-4 py-2 border-b border-border text-[10px] font-semibold text-muted uppercase tracking-widest`}>
      <div />
      <div className="text-right w-28">As entered</div>
      {(view === 'monthly' || view === 'both') && (
        <div className="text-right w-24">Monthly</div>
      )}
      {(view === 'annual' || view === 'both') && (
        <div className="text-right w-24">Annual</div>
      )}
      <div />
    </div>
  )
}

// ── Item row ────────────────────────────────────────────────────────────────

function ItemRow({ item, view, onEdit }: { item: EnrichedItem; view: View; onEdit: () => void }) {
  const annualCents = item.monthlyCents * 12
  return (
    <div className={`grid ${gridCols(view)} gap-x-6 px-4 py-2.5 items-center hover:bg-surface/50 group border-b border-border/40 last:border-0`}>
      <div>
        <div className="text-sm text-ink font-medium">{item.name}</div>
        {item.detail && <div className="text-xs text-muted mt-0.5">{item.detail}</div>}
      </div>
      <div className="text-sm text-right w-28 text-foreground-muted tabular-nums">
        {formatCentsEntered(item.amountCents)}
        <span className="text-xs text-muted ml-1">{FREQ_ABBR[item.frequency]}</span>
      </div>
      {(view === 'monthly' || view === 'both') && (
        <div className="text-sm text-right w-24 tabular-nums text-ink">{formatCents(item.monthlyCents)}</div>
      )}
      {(view === 'annual' || view === 'both') && (
        <div className="text-sm text-right w-24 tabular-nums text-ink">{formatCents(annualCents)}</div>
      )}
      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <EditGlyph onClick={onEdit} />
      </div>
    </div>
  )
}

// ── Subtotal row ─────────────────────────────────────────────────────────────

function SubtotalRow({ label, monthlyCents, view }: { label: string; monthlyCents: number; view: View }) {
  return (
    <div className={`grid ${gridCols(view)} gap-x-6 px-4 py-2.5 items-center border-t border-border bg-surface/60`}>
      <div className="text-xs font-semibold text-muted uppercase tracking-widest">{label}</div>
      <div className="w-28" />
      {(view === 'monthly' || view === 'both') && (
        <div className="text-sm font-semibold text-right w-24 tabular-nums text-ink">{formatCents(monthlyCents)}</div>
      )}
      {(view === 'annual' || view === 'both') && (
        <div className="text-sm font-semibold text-right w-24 tabular-nums text-ink">{formatCents(monthlyCents * 12)}</div>
      )}
      <div />
    </div>
  )
}

// ── Surplus row ──────────────────────────────────────────────────────────────

function SurplusRow({ monthlyCents, view }: { monthlyCents: number; view: View }) {
  const colorClass = monthlyCents >= 0 ? 'text-positive' : 'text-negative'
  return (
    <div className={`grid ${gridCols(view)} gap-x-6 px-4 py-3 items-center border-t-2 border-border bg-surface`}>
      <div className="text-sm font-semibold text-ink">Personal surplus</div>
      <div className="w-28" />
      {(view === 'monthly' || view === 'both') && (
        <div className={`text-sm font-semibold text-right w-24 tabular-nums ${colorClass}`}>{formatCents(monthlyCents)}</div>
      )}
      {(view === 'annual' || view === 'both') && (
        <div className={`text-sm font-semibold text-right w-24 tabular-nums ${colorClass}`}>{formatCents(monthlyCents * 12)}</div>
      )}
      <div />
    </div>
  )
}

// ── Section head ─────────────────────────────────────────────────────────────

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface/40 border-b border-border">
      <span className="text-xs font-semibold text-ink uppercase tracking-wider">{label}</span>
      <span className="text-xs text-muted">· {count} {count === 1 ? 'item' : 'items'}</span>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: (type: BudgetItemType) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <p className="text-base font-semibold text-ink mb-1">Set your household baseline</p>
      <p className="text-sm text-muted mb-6 max-w-xs">
        Add the income you bring in and the expenses you carry.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => onAdd('income')}>Add your first income source</Button>
        <Button variant="outline" onClick={() => onAdd('expense')}>Add an expense</Button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function HouseholdPage() {
  const router = useRouter()
  const [items, setItems] = useState<EnrichedItem[]>([])
  const [summary, setSummary] = useState<Summary>({
    totalIncomeMonthlyCents: 0,
    totalExpensesMonthlyCents: 0,
    surplusMonthlyCents: 0,
  })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('both')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingType, setAddingType] = useState<BudgetItemType | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingAdd, setSavingAdd] = useState(false)

  useEffect(() => {
    fetch('/api/household/items')
      .then(async res => {
        if (res.status === 401) { router.push('/login'); return }
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json() as { items: EnrichedItem[]; summary: Summary }
        setItems(data.items)
        setSummary(data.summary)
      })
      .catch(() => toast.error('Failed to load household items'))
      .finally(() => setLoading(false))
  }, [router])

  function openAdd(type: BudgetItemType) {
    setEditingId(null)
    setAddingType(type)
  }

  function openEdit(id: string) {
    setAddingType(null)
    setEditingId(id)
  }

  function closeAll() {
    setEditingId(null)
    setAddingType(null)
  }

  async function handleAdd(name: string, amountCents: number, frequency: BudgetItemFrequency, detail: string) {
    setSavingAdd(true)
    try {
      const res = await fetch('/api/household/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: addingType, name, amountCents, frequency, detail: detail || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add item')
        return
      }
      const { item } = await res.json() as { item: EnrichedItem }
      const updated = [...items, item]
      setItems(updated)
      setSummary(recomputeSummary(updated))
      closeAll()
    } finally {
      setSavingAdd(false)
    }
  }

  async function handleUpdate(id: string, name: string, amountCents: number, frequency: BudgetItemFrequency, detail: string) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/household/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, amountCents, frequency, detail: detail || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to update item')
        return
      }
      const { item } = await res.json() as { item: EnrichedItem }
      const updated = items.map(i => i.id === id ? item : i)
      setItems(updated)
      setSummary(recomputeSummary(updated))
      closeAll()
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: string) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/household/items/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to delete item')
        return
      }
      const updated = items.filter(i => i.id !== id)
      setItems(updated)
      setSummary(recomputeSummary(updated))
      closeAll()
    } finally {
      setSavingId(null)
    }
  }

  const incomeItems = items.filter(i => i.type === 'income')
  const expenseItems = items.filter(i => i.type === 'expense')
  const hasItems = items.length > 0
  const hasAnyAdd = addingType !== null

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-ink">Household</h1>
          <p className="text-sm text-muted mt-0.5">
            Your personal income and expenses — independent of your portfolio.
          </p>
        </div>
        {(hasItems || hasAnyAdd) && <ViewToggle view={view} onChange={setView} />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-muted">Loading…</div>
      ) : !hasItems && !hasAnyAdd ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">

          {hasItems && <TableHeader view={view} />}

          {/* ── Income section ── */}
          <SectionHead label="Income" count={incomeItems.length} />

          {incomeItems.map(item =>
            editingId === item.id ? (
              <div key={item.id} className="px-4 py-2 border-b border-border/40">
                <ItemForm
                  initialName={item.name}
                  initialAmountDollars={String(item.amountCents / 100)}
                  initialFrequency={item.frequency}
                  initialDetail={item.detail ?? ''}
                  isEditing
                  onSave={(n, a, f, d) => handleUpdate(item.id, n, a, f, d)}
                  onCancel={closeAll}
                  onDelete={() => handleDelete(item.id)}
                  saving={savingId === item.id}
                />
              </div>
            ) : (
              <ItemRow key={item.id} item={item} view={view} onEdit={() => openEdit(item.id)} />
            )
          )}

          {addingType === 'income' ? (
            <div className="px-4 py-2 border-b border-border/40">
              <ItemForm onSave={handleAdd} onCancel={closeAll} saving={savingAdd} />
            </div>
          ) : (
            <div className="px-4 py-2 border-b border-border/40">
              <button
                type="button"
                onClick={() => openAdd('income')}
                className="text-xs text-muted hover:text-ink transition-colors"
              >
                + Add income source
              </button>
            </div>
          )}

          <SubtotalRow label="Total income" monthlyCents={summary.totalIncomeMonthlyCents} view={view} />

          {/* ── Expenses section ── */}
          <SectionHead label="Expenses" count={expenseItems.length} />

          {expenseItems.map(item =>
            editingId === item.id ? (
              <div key={item.id} className="px-4 py-2 border-b border-border/40">
                <ItemForm
                  initialName={item.name}
                  initialAmountDollars={String(item.amountCents / 100)}
                  initialFrequency={item.frequency}
                  initialDetail={item.detail ?? ''}
                  isEditing
                  onSave={(n, a, f, d) => handleUpdate(item.id, n, a, f, d)}
                  onCancel={closeAll}
                  onDelete={() => handleDelete(item.id)}
                  saving={savingId === item.id}
                />
              </div>
            ) : (
              <ItemRow key={item.id} item={item} view={view} onEdit={() => openEdit(item.id)} />
            )
          )}

          {addingType === 'expense' ? (
            <div className="px-4 py-2 border-b border-border/40">
              <ItemForm onSave={handleAdd} onCancel={closeAll} saving={savingAdd} />
            </div>
          ) : (
            <div className="px-4 py-2 border-b border-border/40">
              <button
                type="button"
                onClick={() => openAdd('expense')}
                className="text-xs text-muted hover:text-ink transition-colors"
              >
                + Add expense category
              </button>
            </div>
          )}

          <SubtotalRow label="Total expenses" monthlyCents={summary.totalExpensesMonthlyCents} view={view} />
          <SurplusRow monthlyCents={summary.surplusMonthlyCents} view={view} />
        </div>
      )}
    </div>
  )
}
