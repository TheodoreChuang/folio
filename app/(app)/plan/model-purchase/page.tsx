'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BackToScenarios } from '@/components/plan/back-to-scenarios'
import { HouseholdSurplusBar } from '@/components/plan/household-surplus-bar'
import {
  computeModelPurchase,
  type PurchaseCosts,
  type RunningCosts,
  type ModelPurchaseResult,
} from '@/lib/aggregate/plan/calculators/model-purchase'
import type { PlanContext } from '@/lib/aggregate/plan/context'

// ── Types ─────────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'loaded'; context: PlanContext }
  | { status: 'error' }

type Inputs = {
  priceAud: number
  weeklyRentAud: number
  depositPct: number
  lmiAud: number
  ratePct: number
  termYears: number
  loanType: 'interest_only' | 'principal_and_interest'
  stampDutyAud: number
  legalAud: number
  buildingPestAud: number
  depreciationAud: number
  registrationAud: number
  buyerAgentAud: number
  renovationAud: number
  councilRatesAud: number
  waterAud: number
  buildingInsAud: number
  landlordInsAud: number
  strataAud: number
  landTaxAud: number
  maintenanceAud: number
  adminAud: number
  pmFeePct: number
  vacancyPct: number
  source: 'equity' | 'cash' | 'mix'
  equityChecked: Record<string, boolean>
  equityDrawsAud: Record<string, number>
}

const DEFAULT_INPUTS: Inputs = {
  priceAud: 780000,
  weeklyRentAud: 640,
  depositPct: 20,
  lmiAud: 0,
  ratePct: 6.35,
  termYears: 30,
  loanType: 'interest_only',
  stampDutyAud: 31200,
  legalAud: 1800,
  buildingPestAud: 600,
  depreciationAud: 0,
  registrationAud: 0,
  buyerAgentAud: 0,
  renovationAud: 0,
  councilRatesAud: 0,
  waterAud: 0,
  buildingInsAud: 0,
  landlordInsAud: 0,
  strataAud: 0,
  landTaxAud: 0,
  maintenanceAud: 0,
  adminAud: 0,
  pmFeePct: 0,
  vacancyPct: 0,
  source: 'cash',
  equityChecked: {},
  equityDrawsAud: {},
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtShort(cents: number): string {
  const abs = Math.abs(cents)
  const neg = cents < 0
  let s: string
  if (abs >= 100_000_000) {
    s = '$' + (abs / 100_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  } else if (abs >= 100_000) {
    s = '$' + Math.round(abs / 100_000) + 'k'
  } else {
    s = '$' + Math.round(abs / 100).toLocaleString('en-AU')
  }
  return (neg ? '−' : '') + s
}

function fmtMo(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  return (neg ? '−' : '') + '$' + Math.round(abs / 100).toLocaleString('en-AU')
}

function fmtSignedMo(cents: number): string {
  if (cents === 0) return '$0'
  return (cents > 0 ? '+' : '−') + '$' + Math.round(Math.abs(cents) / 100).toLocaleString('en-AU')
}

function fmtPct(ratio: number, dp = 0): string {
  return (ratio * 100).toFixed(dp) + '%'
}

function fmtPctPts(delta: number): string {
  const v = delta * 100
  const sign = v > 0.005 ? '+' : v < -0.005 ? '−' : ''
  return sign + Math.abs(v).toFixed(1) + 'pp'
}

// ── Input helpers ─────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isFinite(n) ? n : 0
}

function MoneyInput({
  valueAud,
  onChange,
  placeholder = '0',
  suffix,
}: {
  valueAud: number
  onChange: (v: number) => void
  placeholder?: string
  suffix?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (valueAud === 0 ? '' : Math.round(valueAud).toLocaleString('en-AU'))

  return (
    <div className="flex items-center border border-border rounded bg-surface text-sm focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent/50">
      <span className="pl-3 text-foreground-muted select-none">$</span>
      <input
        className="flex-1 min-w-0 px-2 py-2 bg-transparent text-right tabular-nums outline-none"
        inputMode="decimal"
        value={shown}
        placeholder={placeholder}
        onChange={e => {
          setDraft(e.target.value)
          onChange(parseNum(e.target.value))
        }}
        onBlur={() => setDraft(null)}
      />
      {suffix && <span className="pr-3 text-foreground-muted text-xs select-none">{suffix}</span>}
    </div>
  )
}

function PctInput({
  value,
  onChange,
  suffix = '%',
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === 0 ? '' : Number(value.toFixed(2)).toString())

  return (
    <div className="flex items-center border border-border rounded bg-surface text-sm focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent/50">
      <input
        className="flex-1 min-w-0 px-3 py-2 bg-transparent text-right tabular-nums outline-none"
        inputMode="decimal"
        value={shown}
        placeholder="0"
        onChange={e => {
          const raw = e.target.value
          if (/^-?\d*\.?\d*$/.test(raw)) {
            setDraft(raw)
            onChange(parseNum(raw))
          }
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="pr-3 text-foreground-muted text-xs select-none">{suffix}</span>
    </div>
  )
}

function NumInput({
  value,
  onChange,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="flex items-center border border-border rounded bg-surface text-sm focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent/50">
      <input
        className="flex-1 min-w-0 px-3 py-2 bg-transparent text-right tabular-nums outline-none"
        inputMode="numeric"
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={e => onChange(parseNum(e.target.value))}
      />
      {suffix && <span className="pr-3 text-foreground-muted text-xs select-none">{suffix}</span>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-3">
      {children}
    </p>
  )
}

function InputRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="pt-2 flex-shrink-0">
        <span className="text-sm text-foreground-muted">{label}</span>
        {hint && <span className="block text-[10px] text-foreground-subtle">{hint}</span>}
      </div>
      <div className="w-44 flex-shrink-0">{children}</div>
    </div>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Collapsible({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string
  summary?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface-raised text-left hover:bg-surface-sunken/40 transition-colors"
        onClick={onToggle}
        aria-expanded={open}
      >
        <svg
          className={`w-3 h-3 text-foreground-muted transition-transform ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-medium text-ink flex-1">{title}</span>
        {summary && <span className="text-xs text-foreground-subtle">{summary}</span>}
      </button>
      {open && <div className="px-4 py-4 border-t border-rule bg-surface">{children}</div>}
    </div>
  )
}

// ── Portfolio impact tile ─────────────────────────────────────────────────────

function ImpactTile({
  label,
  before,
  after,
  fmt,
  delta,
  deltaDir = 'neutral',
  single = false,
  max: capOverride,
}: {
  label: string
  before?: number
  after: number
  fmt: (n: number) => string
  delta?: string
  deltaDir?: 'up' | 'down' | 'neutral'
  single?: boolean
  max?: number
}) {
  const deltaColor =
    deltaDir === 'up'
      ? 'text-negative'
      : deltaDir === 'down'
        ? 'text-positive'
        : 'text-foreground-muted'

  if (single || before === undefined) {
    return (
      <div className="border border-border rounded p-4 bg-surface-raised">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle mb-2">{label}</p>
        <p className="text-xl font-semibold text-ink tabular-nums">{fmt(after)}</p>
        {delta && <p className={`text-xs mt-1 tabular-nums ${deltaColor}`}>{delta}</p>}
      </div>
    )
  }

  const cap = capOverride ?? Math.max(Math.abs(before), Math.abs(after), 1)
  const beforePct = Math.min(100, (Math.abs(before) / cap) * 100)
  const afterPct = Math.min(100, (Math.abs(after) / cap) * 100)
  const lo = Math.min(beforePct, afterPct)
  const hi = Math.max(beforePct, afterPct)
  const grew = afterPct > beforePct

  const segColor =
    deltaDir === 'up'
      ? 'bg-negative/60'
      : deltaDir === 'down'
        ? 'bg-positive/60'
        : 'bg-accent/40'

  return (
    <div className="border border-border rounded p-4 bg-surface-raised">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle mb-2">{label}</p>
      <p className="text-xl font-semibold text-ink tabular-nums">{fmt(after)}</p>
      <p className="text-xs text-foreground-muted tabular-nums">was {fmt(before)}</p>
      {/* Track bar */}
      <div className="relative h-1.5 bg-surface-sunken rounded-full overflow-hidden mt-3">
        <div className="absolute top-0 bottom-0 left-0 bg-border-strong rounded-full" style={{ width: `${lo}%` }} />
        {hi > lo && (
          <div
            className={`absolute top-0 bottom-0 rounded-full ${grew ? segColor : 'bg-positive/60'}`}
            style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0.6)}%` }}
          />
        )}
      </div>
      {delta && <p className={`text-xs mt-1.5 tabular-nums font-medium ${deltaColor}`}>{delta}</p>}
    </div>
  )
}

// ── Equity draw per property ──────────────────────────────────────────────────

function EquityList({
  equityAvailable,
  drawsAud,
  checkedIds,
  remainingCashCents,
  onChangeDraw,
  onChangeChecked,
}: {
  equityAvailable: ModelPurchaseResult['equityAvailable']
  drawsAud: Record<string, number>
  checkedIds: Record<string, boolean>
  remainingCashCents: number
  onChangeDraw: (propertyId: string, aud: number) => void
  onChangeChecked: (propertyId: string, checked: boolean) => void
}) {
  if (equityAvailable.length === 0) {
    return <p className="text-xs text-foreground-muted mt-3">No properties with a valuation recorded.</p>
  }

  return (
    <div className="flex flex-col gap-2 mt-3">
      {equityAvailable.map(eq => {
        const drawAud = drawsAud[eq.propertyId] ?? 0
        const isOn = checkedIds[eq.propertyId] === true
        const valuationAud = eq.valuationCents / 100
        const outstandingAud = eq.outstandingCents / 100
        const maxAtFullAud = Math.max(0, valuationAud - outstandingAud)
        const isDepleted = maxAtFullAud <= 0
        const curLvr = valuationAud > 0 ? outstandingAud / valuationAud : 0
        const newLvr = valuationAud > 0 ? Math.min(1, (outstandingAud + drawAud) / valuationAud) : 0

        return (
          <div
            key={eq.propertyId}
            className={`border rounded-lg p-3 ${
              isDepleted
                ? 'border-border bg-surface opacity-60'
                : isOn
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-border bg-surface'
            }`}
          >
            <label className={`flex items-start gap-2.5 ${isDepleted ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                className="mt-0.5 w-3.5 h-3.5 rounded accent-accent"
                checked={isOn}
                disabled={isDepleted}
                onChange={e => {
                  const checked = e.target.checked
                  onChangeChecked(eq.propertyId, checked)
                  if (checked && drawAud === 0) {
                    const autoFill = Math.min(maxAtFullAud, Math.max(0, remainingCashCents / 100))
                    onChangeDraw(eq.propertyId, Math.round(autoFill))
                  }
                  if (!checked) {
                    onChangeDraw(eq.propertyId, 0)
                  }
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">{eq.nickname ?? eq.address}</p>
                {isDepleted ? (
                  <p className="text-xs text-foreground-subtle">Already at 100% LVR</p>
                ) : (
                  <p className="text-xs text-foreground-muted">
                    {fmtMo(eq.valuationCents)} · {fmtPct(curLvr, 0)} LVR now
                  </p>
                )}
              </div>
            </label>

            {isOn && !isDepleted && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-foreground-muted mb-1">Draw</p>
                    <MoneyInput
                      valueAud={drawAud}
                      onChange={v => onChangeDraw(eq.propertyId, Math.max(0, Math.min(maxAtFullAud, v)))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-foreground-muted mb-1">To LVR</p>
                    <PctInput
                      value={Math.round(newLvr * 100)}
                      onChange={v => {
                        const lvr = Math.min(100, Math.max(0, v))
                        onChangeDraw(
                          eq.propertyId,
                          Math.max(0, Math.min(maxAtFullAud, (lvr / 100) * valuationAud - outstandingAud)),
                        )
                      }}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="relative h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-border-strong rounded-full"
                      style={{ width: `${Math.min(100, curLvr * 100)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 bg-negative/50 rounded-full"
                      style={{
                        left: `${Math.min(100, curLvr * 100)}%`,
                        width: `${Math.min(100 - curLvr * 100, Math.max(0, (newLvr - curLvr) * 100))}%`,
                      }}
                    />
                    <div className="absolute top-0 bottom-0 w-px bg-foreground-muted/60" style={{ left: '80%' }} />
                  </div>
                  <p className="text-[10px] text-foreground-subtle mt-1">
                    80% common cap · up to {fmtMo(maxAtFullAud * 100)} at 100%
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Inputs panel ──────────────────────────────────────────────────────────────

function InputsPanel({
  inputs,
  result,
  onChange,
}: {
  inputs: Inputs
  result: ModelPurchaseResult
  onChange: (patch: Partial<Inputs>) => void
}) {
  const [costsOpen, setCostsOpen] = useState(false)
  const [runningOpen, setRunningOpen] = useState(false)

  const depositAud = Math.round(inputs.priceAud * inputs.depositPct / 100)
  const baseLoanAud = Math.max(0, inputs.priceAud - depositAud)

  const purchaseCostTotal =
    inputs.stampDutyAud + inputs.legalAud + inputs.buildingPestAud +
    inputs.depreciationAud + inputs.registrationAud + inputs.buyerAgentAud + inputs.renovationAud
  const purchaseCostCount = [
    inputs.stampDutyAud, inputs.legalAud, inputs.buildingPestAud,
    inputs.depreciationAud, inputs.registrationAud, inputs.buyerAgentAud, inputs.renovationAud,
  ].filter(v => v > 0).length

  const runningCostAnnualAud = (
    inputs.councilRatesAud + inputs.waterAud + inputs.buildingInsAud +
    inputs.landlordInsAud + inputs.strataAud + inputs.landTaxAud +
    inputs.maintenanceAud + inputs.adminAud +
    (inputs.pmFeePct / 100) * inputs.weeklyRentAud * 52 +
    (inputs.vacancyPct / 100) * inputs.weeklyRentAud * 52
  )
  const runningCostCount = [
    inputs.councilRatesAud, inputs.waterAud, inputs.buildingInsAud,
    inputs.landlordInsAud, inputs.strataAud, inputs.landTaxAud,
    inputs.maintenanceAud, inputs.adminAud, inputs.pmFeePct, inputs.vacancyPct,
  ].filter(v => v > 0).length

  return (
    <div className="flex flex-col gap-5">
      {/* Property */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 pt-4 pb-5">
        <SectionLabel>Property</SectionLabel>
        <div className="flex flex-col gap-4">
          <InputRow label="Purchase price">
            <MoneyInput valueAud={inputs.priceAud} onChange={v => onChange({ priceAud: v })} placeholder="780,000" />
          </InputRow>
          <InputRow label="Weekly rent">
            <MoneyInput valueAud={inputs.weeklyRentAud} onChange={v => onChange({ weeklyRentAud: v })} suffix="/ wk" placeholder="640" />
          </InputRow>
        </div>
      </div>

      {/* Deposit */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 pt-4 pb-5">
        <SectionLabel>Deposit</SectionLabel>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-foreground-muted mb-1.5">Amount</p>
              <MoneyInput
                valueAud={depositAud}
                onChange={v => onChange({ depositPct: inputs.priceAud > 0 ? (v / inputs.priceAud) * 100 : 0 })}
                placeholder="156,000"
              />
            </div>
            <div>
              <p className="text-xs text-foreground-muted mb-1.5">Deposit %</p>
              <PctInput value={inputs.depositPct} onChange={v => onChange({ depositPct: v })} />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>
              New loan {fmtMo(baseLoanAud * 100)}
              {result.lmiRequired && inputs.lmiAud > 0 && ` + ${fmtMo(inputs.lmiAud * 100)} LMI`}
            </span>
            <span className={result.lmiRequired ? 'text-negative font-medium' : ''}>
              LVR {fmtPct(result.lmiRequired ? (baseLoanAud / inputs.priceAud) : (baseLoanAud / Math.max(1, inputs.priceAud)), 0)}
              {result.lmiRequired && ' · LMI territory'}
            </span>
          </div>

          {result.lmiRequired && (
            <InputRow label="LMI estimate" hint="Capitalised onto the loan">
              <MoneyInput valueAud={inputs.lmiAud} onChange={v => onChange({ lmiAud: v })} />
            </InputRow>
          )}

          {/* Funded from segmented control */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-foreground-muted pt-2 flex-shrink-0">Funded from</span>
            <div className="w-44 flex-shrink-0 flex border border-border rounded overflow-hidden text-sm">
              {(['equity', 'cash', 'mix'] as const).map((val, i) => (
                <button
                  key={val}
                  type="button"
                  className={`flex-1 py-2 text-center text-xs transition-colors ${
                    inputs.source === val ? 'bg-ink text-white font-semibold' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'
                  } ${i > 0 ? 'border-l border-border' : ''}`}
                  onClick={() => {
                    if (val === 'cash') {
                      onChange({ source: val, equityChecked: {}, equityDrawsAud: {} })
                    } else {
                      onChange({ source: val })
                    }
                  }}
                >
                  {val === 'equity' ? 'Equity' : val === 'cash' ? 'Cash' : 'Both'}
                </button>
              ))}
            </div>
          </div>

          {inputs.source !== 'cash' && (
            <EquityList
              equityAvailable={result.equityAvailable}
              drawsAud={inputs.equityDrawsAud}
              checkedIds={inputs.equityChecked}
              remainingCashCents={result.cashContributionCents}
              onChangeDraw={(id, aud) =>
                onChange({ equityDrawsAud: { ...inputs.equityDrawsAud, [id]: aud } })
              }
              onChangeChecked={(id, checked) =>
                onChange({ equityChecked: { ...inputs.equityChecked, [id]: checked } })
              }
            />
          )}

          {inputs.source === 'mix' && result.cashContributionCents > 0 && (
            <p className="text-xs text-foreground-muted">
              Remaining <span className="font-medium text-ink">{fmtMo(result.cashContributionCents)}</span> funded by cash
            </p>
          )}

          {/* Allocation status */}
          {inputs.priceAud > 0 && (
            <div className={`flex items-center justify-between text-xs px-3 py-2 rounded ${
              result.shortfallCents <= 0
                ? 'bg-positive/10 text-positive'
                : 'bg-surface-sunken text-foreground-muted'
            }`}>
              <span>{result.shortfallCents <= 0 ? 'Funds fully allocated' : 'Still to fund'}</span>
              <span className="tabular-nums font-medium">
                {result.shortfallCents <= 0
                  ? fmtMo(result.fundsRequiredCents)
                  : fmtMo(result.shortfallCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* New loan */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 pt-4 pb-5">
        <SectionLabel>New loan</SectionLabel>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-foreground-muted mb-1.5">Interest rate</p>
              <PctInput value={inputs.ratePct} onChange={v => onChange({ ratePct: v })} suffix="% p.a." />
            </div>
            <div>
              <p className="text-xs text-foreground-muted mb-1.5">Type</p>
              <div className="flex border border-border rounded overflow-hidden text-sm">
                <button
                  type="button"
                  className={`flex-1 py-2 text-center text-xs transition-colors ${inputs.loanType === 'interest_only' ? 'bg-ink text-white font-semibold' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`}
                  onClick={() => onChange({ loanType: 'interest_only' })}
                >
                  IO
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 text-center text-xs transition-colors ${inputs.loanType === 'principal_and_interest' ? 'bg-ink text-white font-semibold' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`}
                  onClick={() => onChange({ loanType: 'principal_and_interest' })}
                >
                  P&amp;I
                </button>
              </div>
            </div>
          </div>
          <InputRow label="Loan term">
            <NumInput value={inputs.termYears} onChange={v => onChange({ termYears: v })} suffix="yr" />
          </InputRow>
        </div>
      </div>

      {/* Purchase costs */}
      <Collapsible
        title="One-off purchase costs"
        summary={purchaseCostCount > 0 ? `${purchaseCostCount} item${purchaseCostCount !== 1 ? 's' : ''} · ${fmtMo(purchaseCostTotal * 100)}` : 'Optional — none added'}
        open={costsOpen}
        onToggle={() => setCostsOpen(o => !o)}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {([
            ['Stamp duty', 'stampDutyAud'],
            ['Legal & conveyancing', 'legalAud'],
            ['Building & pest', 'buildingPestAud'],
            ['Depreciation schedule', 'depreciationAud'],
            ['Registration & transfer', 'registrationAud'],
            ["Buyer's agent fee", 'buyerAgentAud'],
            ['Upfront maintenance', 'renovationAud'],
          ] as const).map(([label, key]) => (
            <div key={key}>
              <p className="text-xs text-foreground-muted mb-1">{label}</p>
              <MoneyInput valueAud={inputs[key]} onChange={v => onChange({ [key]: v } as Partial<Inputs>)} />
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Running costs */}
      <Collapsible
        title="Annual holding costs"
        summary={runningCostCount > 0 ? `${runningCostCount} item${runningCostCount !== 1 ? 's' : ''} · ${fmtMo(runningCostAnnualAud * 100)}/yr` : 'Optional — none added'}
        open={runningOpen}
        onToggle={() => setRunningOpen(o => !o)}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {([
            ['Council rates', 'councilRatesAud', false],
            ['Water & sewerage', 'waterAud', false],
            ['Building insurance', 'buildingInsAud', false],
            ['Landlord insurance', 'landlordInsAud', false],
            ['Strata / body corporate', 'strataAud', false],
            ['Land tax', 'landTaxAud', false],
            ['Repairs & maintenance', 'maintenanceAud', false],
            ['Accounting & admin', 'adminAud', false],
          ] as const).map(([label, key]) => (
            <div key={key}>
              <p className="text-xs text-foreground-muted mb-1">{label}</p>
              <MoneyInput valueAud={inputs[key]} onChange={v => onChange({ [key]: v } as Partial<Inputs>)} suffix="/ yr" />
            </div>
          ))}
          <div>
            <p className="text-xs text-foreground-muted mb-1">Property management</p>
            <PctInput value={inputs.pmFeePct} onChange={v => onChange({ pmFeePct: v })} suffix="% of rent" />
          </div>
          <div>
            <p className="text-xs text-foreground-muted mb-1">Vacancy allowance</p>
            <PctInput value={inputs.vacancyPct} onChange={v => onChange({ vacancyPct: v })} suffix="% of rent" />
          </div>
        </div>
      </Collapsible>
    </div>
  )
}

// ── Outputs panel ─────────────────────────────────────────────────────────────

function OutputsPanel({
  result,
  priceAud,
  depositPct,
  purchaseCostItems,
}: {
  result: ModelPurchaseResult
  priceAud: number
  depositPct: number
  purchaseCostItems: { label: string; aud: number }[]
}) {
  const gearingColor =
    result.gearing === 'positive'
      ? 'text-positive'
      : result.gearing === 'negative'
        ? 'text-negative'
        : 'text-foreground-muted'

  const ready = priceAud > 0 && result.monthlyRentCents > 0

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-3xl font-display text-foreground-muted">— / mo</p>
        <p className="mt-3 text-sm text-foreground-subtle max-w-[28ch]">
          Enter a purchase price and weekly rent to see cashflow, funding and portfolio impact.
        </p>
      </div>
    )
  }

  const portfolioCfDelta =
    result.portfolioCashflowMonthlyCents !== null && result.portfolioCashflowAfterMonthlyCents !== null
      ? result.portfolioCashflowAfterMonthlyCents - result.portfolioCashflowMonthlyCents
      : null

  const cashflowMax = Math.max(
    Math.abs(result.portfolioCashflowMonthlyCents ?? 0),
    Math.abs(result.portfolioCashflowAfterMonthlyCents ?? 0),
    1,
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Cashflow headline */}
      <div>
        <SectionLabel>Cashflow on this property</SectionLabel>
        <div className="flex items-baseline gap-3">
          <span className={`font-display text-3xl tracking-tight tabular-nums ${gearingColor}`}>
            {fmtSignedMo(result.propertyCashflowMonthlyCents)}
            <span className="text-base font-normal"> / mo</span>
          </span>
          <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${
            result.gearing === 'positive'
              ? 'bg-positive/10 text-positive'
              : result.gearing === 'negative'
                ? 'bg-negative/10 text-negative'
                : 'bg-surface-sunken text-foreground-muted'
          }`}>
            {result.gearing === 'positive'
              ? 'positively geared'
              : result.gearing === 'negative'
                ? 'negatively geared'
                : 'neutral'}
          </span>
        </div>

        {/* Breakdown */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-foreground-muted">Rent <span className="text-ink tabular-nums">{fmtMo(result.monthlyRentCents)}</span></span>
          <span className="text-foreground-subtle">−</span>
          <span className="text-foreground-muted">Loan <span className="text-ink tabular-nums">{fmtMo(result.newLoanRepaymentMonthlyCents)}</span></span>
          <span className="text-foreground-subtle">−</span>
          <span className="text-foreground-muted">Costs <span className="text-ink tabular-nums">{fmtMo(result.runningCostsMonthlyCents)}</span></span>
          <span className="text-foreground-subtle">=</span>
          <span className={`font-semibold tabular-nums ${gearingColor}`}>{fmtSignedMo(result.propertyCashflowMonthlyCents)}</span>
        </div>
      </div>

      {/* Funding */}
      <div>
        <SectionLabel>Funding required</SectionLabel>
        <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule text-sm">
            <div>
              <span className="text-foreground-muted">Deposit</span>
              <span className="block text-[11px] text-foreground-subtle">{depositPct}% of price</span>
            </div>
            <span className="tabular-nums text-ink">{fmtMo(result.depositCents)}</span>
          </div>
          {purchaseCostItems.map(item => (
            <div key={item.label} className="flex items-center justify-between px-4 py-3 border-b border-rule text-sm">
              <span className="text-foreground-muted">{item.label}</span>
              <span className="tabular-nums text-ink">{fmtMo(item.aud * 100)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
            <span className="text-ink">Cash required</span>
            <span className="tabular-nums text-ink">{fmtMo(result.fundsRequiredCents)}</span>
          </div>
        </div>
        {/* Funding source chips */}
        <div className="flex flex-wrap gap-2 mt-2">
          {result.equityDrawnCents > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent/10 text-accent text-xs rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Equity {fmtMo(result.equityDrawnCents)}
            </span>
          )}
          {result.cashContributionCents > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-sunken text-foreground-muted text-xs rounded-full font-medium">
              <span className="w-2 h-2 rounded-full bg-foreground-muted" />
              Cash {fmtMo(result.cashContributionCents)}
            </span>
          )}
        </div>
        {result.lmiRequired && result.lmiAmountCents > 0 && (
          <p className="mt-1.5 text-xs text-foreground-muted">
            + {fmtMo(result.lmiAmountCents)} LMI capitalised onto the loan
          </p>
        )}
      </div>

      {/* Portfolio impact */}
      <div>
        <SectionLabel>Impact on portfolio</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <ImpactTile
            label="Total value"
            before={result.portfolioValueBefore}
            after={result.portfolioValueAfter}
            fmt={fmtShort}
            delta={'+' + fmtShort(result.portfolioValueAfter - result.portfolioValueBefore)}
            deltaDir="neutral"
          />
          <ImpactTile
            label="Total debt"
            before={result.portfolioDebtBefore}
            after={result.portfolioDebtAfter}
            fmt={fmtShort}
            delta={'+' + fmtShort(result.portfolioDebtAfter - result.portfolioDebtBefore)}
            deltaDir="up"
          />
          <ImpactTile
            label="Blended LVR"
            before={result.portfolioLvrBefore}
            after={result.portfolioLvrAfter}
            fmt={r => fmtPct(r, 1)}
            delta={fmtPctPts(result.portfolioLvrAfter - result.portfolioLvrBefore)}
            deltaDir={result.portfolioLvrAfter >= result.portfolioLvrBefore ? 'up' : 'down'}
          />
          {result.portfolioCashflowMonthlyCents !== null && result.portfolioCashflowAfterMonthlyCents !== null ? (
            <ImpactTile
              label="Net cashflow / mo"
              before={result.portfolioCashflowMonthlyCents}
              after={result.portfolioCashflowAfterMonthlyCents}
              fmt={fmtMo}
              delta={portfolioCfDelta !== null ? fmtSignedMo(portfolioCfDelta) + ' / mo' : undefined}
              deltaDir={portfolioCfDelta !== null && portfolioCfDelta >= 0 ? 'down' : 'up'}
              max={cashflowMax}
            />
          ) : (
            <ImpactTile
              label="Net cashflow / mo"
              after={result.propertyCashflowMonthlyCents}
              fmt={fmtMo}
              delta="No portfolio data"
              single
            />
          )}
          <ImpactTile
            label="Cash needed"
            after={result.fundsRequiredCents}
            fmt={fmtMo}
            delta="deposit + costs"
            single
          />
          <ImpactTile
            label="New property LVR"
            after={result.newLoanCents / Math.max(1, result.newLoanCents + result.depositCents)}
            fmt={r => fmtPct(r, 1)}
            delta={result.lmiRequired ? 'LMI territory' : 'within 80%'}
            deltaDir={result.lmiRequired ? 'up' : 'neutral'}
            single
          />
        </div>
      </div>

      {/* Household bar */}
      <HouseholdSurplusBar
        surplusCents={result.householdSurplusMonthlyCents}
        consumedCents={result.portfolioCashflowAfterMonthlyCents !== null && result.portfolioCashflowAfterMonthlyCents < 0
          ? Math.abs(result.portfolioCashflowAfterMonthlyCents)
          : 0}
        label="Portfolio shortfall after purchase"
      />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModelPurchasePage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS)

  useEffect(() => {
    fetch('/api/plan/context')
      .then(res => {
        if (res.status === 401) { router.push('/login'); return null }
        return res.json()
      })
      .then(body => {
        if (!body) return
        if (body.context) {
          setPageState({ status: 'loaded', context: body.context })
        } else {
          setPageState({ status: 'error' })
        }
      })
      .catch(() => setPageState({ status: 'error' }))
  }, [router])

  if (pageState.status === 'loading') {
    return (
      <div>
        <BackToScenarios />
        <div className="flex items-center justify-center py-24 text-sm text-muted">Loading…</div>
      </div>
    )
  }

  if (pageState.status === 'error') {
    return (
      <div>
        <BackToScenarios />
        <p className="text-sm text-muted py-8">Failed to load. Refresh to try again.</p>
      </div>
    )
  }

  const { context } = pageState

  const purchaseCosts: PurchaseCosts = {
    stampDutyCents: Math.round(inputs.stampDutyAud * 100),
    legalCents: Math.round(inputs.legalAud * 100),
    buildingPestCents: Math.round(inputs.buildingPestAud * 100),
    depreciationCents: Math.round(inputs.depreciationAud * 100),
    registrationCents: Math.round(inputs.registrationAud * 100),
    buyerAgentCents: Math.round(inputs.buyerAgentAud * 100),
    renovationCents: Math.round(inputs.renovationAud * 100),
  }

  const runningCosts: RunningCosts = {
    councilRatesCents: Math.round(inputs.councilRatesAud * 100),
    waterCents: Math.round(inputs.waterAud * 100),
    buildingInsCents: Math.round(inputs.buildingInsAud * 100),
    landlordInsCents: Math.round(inputs.landlordInsAud * 100),
    strataCents: Math.round(inputs.strataAud * 100),
    landTaxCents: Math.round(inputs.landTaxAud * 100),
    maintenanceCents: Math.round(inputs.maintenanceAud * 100),
    adminCents: Math.round(inputs.adminAud * 100),
    pmFeePct: inputs.pmFeePct,
    vacancyPct: inputs.vacancyPct,
  }

  const equitySources = Object.entries(inputs.equityDrawsAud)
    .filter(([, aud]) => aud > 0)
    .map(([propertyId, aud]) => ({ propertyId, drawCents: Math.round(aud * 100) }))

  const result = computeModelPurchase({
    purchasePriceCents: Math.round(inputs.priceAud * 100),
    weeklyRentCents: Math.round(inputs.weeklyRentAud * 100),
    depositPct: inputs.depositPct,
    lmiAmountCents: Math.round(inputs.lmiAud * 100),
    newLoanRatePct: inputs.ratePct,
    newLoanTermYears: inputs.termYears,
    newLoanType: inputs.loanType,
    purchaseCosts,
    runningCosts,
    equitySources,
    properties: context.properties,
    loans: context.loans,
    portfolioBaseline: context.portfolioBaseline,
    householdSurplusMonthlyCents: context.householdSurplusMonthlyCents,
  })

  const purchaseCostItems: { label: string; aud: number }[] = [
    { label: 'Stamp duty', aud: inputs.stampDutyAud },
    { label: 'Legal & conveyancing', aud: inputs.legalAud },
    { label: 'Building & pest', aud: inputs.buildingPestAud },
    { label: 'Depreciation schedule', aud: inputs.depreciationAud },
    { label: 'Registration & transfer', aud: inputs.registrationAud },
    { label: "Buyer's agent fee", aud: inputs.buyerAgentAud },
    { label: 'Upfront maintenance', aud: inputs.renovationAud },
  ].filter(item => item.aud > 0)

  return (
    <div className="max-w-[1100px]">
      <BackToScenarios />

      {/* Outer calculator card */}
      <div className="border border-border rounded-xl bg-surface overflow-clip">
        {/* Card header */}
        <div className="px-6 py-5 border-b border-rule">
          <h1 className="font-display text-xl text-ink">Model a purchase</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Estimate how a property acquisition would affect your portfolio cashflow and LVR.
          </p>
        </div>
        {/* Card body: two columns */}
        <div className="grid grid-cols-[420px_1fr] items-start">
          {/* Left: inputs */}
          <div className="border-r border-rule p-6">
            <InputsPanel
              inputs={inputs}
              result={result}
              onChange={patch => setInputs(prev => ({ ...prev, ...patch }))}
            />
          </div>
          {/* Right: outputs */}
          <div className="bg-surface-sunken/40 p-6">
            <div className="sticky top-6">
              <OutputsPanel
                result={result}
                priceAud={inputs.priceAud}
                depositPct={inputs.depositPct}
                purchaseCostItems={purchaseCostItems}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-foreground-subtle">
        Cashflow assumes current rents · trailing 12-month expense average · tax implications not considered
      </p>
    </div>
  )
}
