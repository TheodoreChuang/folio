'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ComposedChart, Line, XAxis, YAxis, ReferenceLine, Tooltip } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { BackToScenarios } from '@/components/plan/back-to-scenarios'
import {
  computeHoldReinvest,
  type HoldReinvestResult,
} from '@/lib/aggregate/plan/calculators/hold-reinvest'
import {
  computeCgtEstimate,
  type CgtEstimateResult,
} from '@/lib/aggregate/plan/calculators/cgt-estimate'
import type { PlanContext, PlanContextProperty } from '@/lib/aggregate/plan/context'

// ── Types ─────────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'loaded'; context: PlanContext }
  | { status: 'error' }

type Inputs = {
  selectedPropertyId: string
  salePriceAud: number
  commissionPct: number
  sellingLegalAud: number
  sellingMarketingAud: number
  sellingOtherAud: number
  cgtMode: 'estimate' | 'manual'
  cgtManualAud: number
  cgtPurchasePriceAud: number
  cgtCostStampDutyAud: number
  cgtCostLegalAud: number
  cgtCostBuildingPestAud: number
  cgtCostBuyerAgentAud: number
  cgtCostImprovementsAud: number
  cgtDepreciationAud: number
  cgtDiscountPct: number
  cgtMarginalRatePct: number
  stampDutyAud: number
  buyingLegalAud: number
  buildingPestAud: number
  buyingOtherAud: number
  newLoanRatePct: number
  newLoanTermYears: number
  newLoanType: 'principal_and_interest' | 'interest_only'
  lmiAud: number
  holdGrowthRatePct: number
  reinvestGrowthRatePct: number
  horizonYears: number
}

const DEFAULT_INPUTS: Inputs = {
  selectedPropertyId: '',
  salePriceAud: 0,
  commissionPct: 2.2,
  sellingLegalAud: 1500,
  sellingMarketingAud: 0,
  sellingOtherAud: 0,
  cgtMode: 'estimate',
  cgtManualAud: 0,
  cgtPurchasePriceAud: 0,
  cgtCostStampDutyAud: 0,
  cgtCostLegalAud: 0,
  cgtCostBuildingPestAud: 0,
  cgtCostBuyerAgentAud: 0,
  cgtCostImprovementsAud: 0,
  cgtDepreciationAud: 0,
  cgtDiscountPct: 50,
  cgtMarginalRatePct: 37,
  stampDutyAud: 0,
  buyingLegalAud: 1500,
  buildingPestAud: 600,
  buyingOtherAud: 0,
  newLoanRatePct: 6.35,
  newLoanTermYears: 30,
  newLoanType: 'principal_and_interest',
  lmiAud: 0,
  holdGrowthRatePct: 5.0,
  reinvestGrowthRatePct: 7.0,
  horizonYears: 10,
}

const HORIZONS = [5, 10, 15, 20] as const

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtShort(cents: number): string {
  const abs = Math.abs(cents)
  const neg = cents < 0
  let s: string
  if (abs >= 100_000_000) {
    s = '$' + (abs / 100_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  } else if (abs >= 1_000_000) {
    const kv = Math.round(abs / 100_000)
    s = kv >= 1000
      ? '$' + (abs / 100_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
      : '$' + kv + 'k'
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

function fmtPct(value: number, dp = 1): string {
  return value.toFixed(dp) + '%'
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
}: {
  valueAud: number
  onChange: (v: number) => void
  placeholder?: string
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
        onChange={e => { setDraft(e.target.value); onChange(parseNum(e.target.value)) }}
        onBlur={() => setDraft(null)}
      />
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
          if (/^\d*\.?\d*$/.test(raw)) { setDraft(raw); onChange(parseNum(raw)) }
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="pr-3 text-foreground-muted text-xs select-none">{suffix}</span>
    </div>
  )
}

function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
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

function InputRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="text-sm font-semibold text-ink">{title}</span>
    </div>
  )
}

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
        <svg className={`w-3 h-3 text-foreground-muted transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 12 12" fill="currentColor">
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-medium text-ink flex-1">{title}</span>
        {summary && <span className="text-xs text-foreground-subtle">{summary}</span>}
      </button>
      {open && <div className="px-4 py-4 border-t border-rule bg-surface">{children}</div>}
    </div>
  )
}

// ── Ledger row ─────────────────────────────────────────────────────────────────

function LedgerRow({
  label,
  sub,
  value,
  total,
  positive,
}: {
  label: string
  sub?: string
  value: string
  total?: boolean
  positive?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between px-4 py-2.5 ${total ? 'border-t border-rule font-semibold' : 'border-b border-rule/60'}`}>
      <div>
        <span className={`text-sm ${total ? 'text-ink' : 'text-foreground-muted'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-foreground-subtle">{sub}</span>}
      </div>
      <span className={`text-sm tabular-nums ${total ? (positive ? 'text-positive' : 'text-ink') : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

// ── Comparison tile ───────────────────────────────────────────────────────────

function CompareTile({
  label,
  hold,
  reinvest,
  holdSub,
  reinvestSub,
  footer,
}: {
  label: string
  hold: string
  reinvest: string
  holdSub?: string
  reinvestSub?: string
  footer?: boolean
}) {
  return (
    <div className={`grid grid-cols-[1fr_1fr_1fr] gap-0 border-b border-rule/60 ${footer ? 'border-b-0' : ''}`}>
      <div className="py-2.5 px-2">
        <span className="text-xs text-foreground-muted">{label}</span>
      </div>
      <div className="py-2.5 px-2 border-l border-rule/60">
        <span className="text-sm tabular-nums text-ink font-medium">{hold}</span>
        {holdSub && <span className="block text-[11px] text-foreground-subtle">{holdSub}</span>}
      </div>
      <div className="py-2.5 px-2 border-l border-rule/60">
        <span className="text-sm tabular-nums text-ink font-medium">{reinvest}</span>
        {reinvestSub && <span className="block text-[11px] text-foreground-subtle">{reinvestSub}</span>}
      </div>
    </div>
  )
}

// ── Inputs panel ──────────────────────────────────────────────────────────────

function InputsPanel({
  inputs,
  result,
  properties,
  onChange,
  cgtCents,
  cgtEstimate,
}: {
  inputs: Inputs
  result: HoldReinvestResult | null
  properties: PlanContextProperty[]
  onChange: (patch: Partial<Inputs>) => void
  cgtCents: number
  cgtEstimate: CgtEstimateResult | null
}) {
  const [buyingOpen, setBuyingOpen] = useState(true)
  const [cgtOpen, setCgtOpen] = useState(false)

  const selectedProp = properties.find(p => p.id === inputs.selectedPropertyId)
  const priceDelta = selectedProp?.latestValuation
    ? Math.round(inputs.salePriceAud * 100) - selectedProp.latestValuation.valueCents
    : null

  const buyingTotal = inputs.stampDutyAud + inputs.buyingLegalAud + inputs.buildingPestAud + inputs.buyingOtherAud
  const buyingCount = [inputs.stampDutyAud, inputs.buyingLegalAud, inputs.buildingPestAud, inputs.buyingOtherAud].filter(v => v > 0).length

  const lmiRequired = result?.showLmi ?? false

  return (
    <div className="flex flex-col gap-5">
      {/* Step 1: Sale */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 pt-4 pb-5">
        <StepHeader n={1} title="Sale" />

        {/* Property selector */}
        <div className="mb-4">
          <p className="text-xs text-foreground-muted mb-1.5">Property to sell</p>
          {properties.length === 0 ? (
            <p className="text-sm text-foreground-subtle italic">No properties in portfolio yet.</p>
          ) : (
            <select
              className="w-full border border-border rounded bg-surface text-sm px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
              value={inputs.selectedPropertyId}
              onChange={e => {
                const id = e.target.value
                const prop = properties.find(p => p.id === id)
                onChange({
                  selectedPropertyId: id,
                  salePriceAud: prop?.latestValuation ? prop.latestValuation.valueCents / 100 : 0,
                  cgtPurchasePriceAud: prop?.purchasePriceCents ? prop.purchasePriceCents / 100 : 0,
                  cgtManualAud: 0,
                  cgtCostStampDutyAud: 0,
                  cgtCostLegalAud: 0,
                  cgtCostBuildingPestAud: 0,
                  cgtCostBuyerAgentAud: 0,
                  cgtCostImprovementsAud: 0,
                  cgtDepreciationAud: 0,
                })
              }}
            >
              <option value="">Select a property…</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nickname ?? p.address}
                  {p.latestValuation ? ` · ${fmtShort(p.latestValuation.valueCents)}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <InputRow label="Sale price">
              <MoneyInput valueAud={inputs.salePriceAud} onChange={v => onChange({ salePriceAud: v })} placeholder="850,000" />
            </InputRow>
            {priceDelta !== null && (
              <p className={`text-[11px] mt-1 text-right tabular-nums ${priceDelta > 0 ? 'text-positive' : priceDelta < 0 ? 'text-negative' : 'text-foreground-subtle'}`}>
                {priceDelta === 0
                  ? 'Matches latest valuation'
                  : (priceDelta > 0 ? '+' : '−') + fmtMo(Math.abs(priceDelta)) + ' vs latest valuation'}
              </p>
            )}
          </div>

          {/* Selling costs */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-2">
              Selling costs <span className="normal-case font-normal text-foreground-subtle">— all optional</span>
            </p>
            <div className="flex flex-col gap-3">
              <InputRow label="Agent commission">
                <PctInput value={inputs.commissionPct} onChange={v => onChange({ commissionPct: v })} suffix="%" />
              </InputRow>
              <InputRow label="Legal & conveyancing">
                <MoneyInput valueAud={inputs.sellingLegalAud} onChange={v => onChange({ sellingLegalAud: v })} />
              </InputRow>
              <InputRow label="Marketing">
                <MoneyInput valueAud={inputs.sellingMarketingAud} onChange={v => onChange({ sellingMarketingAud: v })} />
              </InputRow>
              <InputRow label="Other">
                <MoneyInput valueAud={inputs.sellingOtherAud} onChange={v => onChange({ sellingOtherAud: v })} />
              </InputRow>
            </div>
          </div>

          {/* CGT */}
          <div>
            {/* Summary header */}
            <div className="flex items-start justify-between mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle pt-0.5">
                {inputs.cgtMode === 'manual' ? 'CGT — your figure' : 'Estimated CGT'}
              </p>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {inputs.cgtMode === 'estimate'
                  ? (cgtEstimate ? fmtMo(cgtCents) : '—')
                  : (inputs.cgtManualAud > 0 ? fmtMo(Math.round(inputs.cgtManualAud * 100)) : '—')}
              </span>
            </div>
            <p className="text-[11px] text-foreground-muted leading-snug mb-3">
              {inputs.cgtMode === 'manual'
                ? (inputs.cgtManualAud > 0
                    ? 'Manual figure — overrides the estimate'
                    : 'Enter a figure below, or switch to Estimate')
                : !cgtEstimate
                ? 'Enter a sale price to compute an estimate'
                : cgtEstimate.isCapitalLoss
                ? 'Sale is below the cost base — a capital loss, no CGT payable'
                : <>Cost base <strong>{fmtShort(cgtEstimate.costBaseCents)}</strong> · gain <strong>{fmtShort(cgtEstimate.grossGainCents)}</strong> · {inputs.cgtDiscountPct}% discount · {inputs.cgtMarginalRatePct}% rate</>}
            </p>
            <Collapsible
              title="CGT details"
              summary={inputs.cgtMode === 'manual' ? 'Manual' : 'Estimate'}
              open={cgtOpen}
              onToggle={() => setCgtOpen(o => !o)}
            >
              {/* Mode toggle */}
              <div className="flex border border-border rounded overflow-hidden text-sm mb-4">
                <button
                  type="button"
                  className={`flex-1 py-2 text-center text-xs transition-colors ${inputs.cgtMode !== 'manual' ? 'bg-foreground-muted text-white font-medium' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`}
                  onClick={() => onChange({ cgtMode: 'estimate' })}
                >
                  Estimate
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 text-center text-xs transition-colors border-l border-border ${inputs.cgtMode === 'manual' ? 'bg-foreground-muted text-white font-medium' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`}
                  onClick={() => onChange({ cgtMode: 'manual' })}
                >
                  Manual
                </button>
              </div>

              {inputs.cgtMode === 'manual' ? (
                <div className="flex flex-col gap-3">
                  <InputRow label="CGT amount">
                    <MoneyInput valueAud={inputs.cgtManualAud} onChange={v => onChange({ cgtManualAud: v })} placeholder="Estimated CGT" />
                  </InputRow>
                  <p className="text-[11px] text-foreground-subtle leading-snug">
                    A figure from your accountant. Leave blank to exclude CGT from the comparison.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <InputRow label="Original purchase price" hint="from your records">
                    <MoneyInput valueAud={inputs.cgtPurchasePriceAud} onChange={v => onChange({ cgtPurchasePriceAud: v })} placeholder="430,000" />
                  </InputRow>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-2">
                      Purchase costs &amp; improvements <span className="normal-case font-normal text-foreground-subtle">— added to the cost base</span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {([
                        ['Stamp duty (on purchase)', 'cgtCostStampDutyAud'],
                        ['Legal & conveyancing', 'cgtCostLegalAud'],
                        ['Building & pest', 'cgtCostBuildingPestAud'],
                        ["Buyer's agent fee", 'cgtCostBuyerAgentAud'],
                        ['Capital improvements', 'cgtCostImprovementsAud'],
                      ] as const).map(([label, key]) => (
                        <div key={key}>
                          <p className="text-xs text-foreground-muted mb-1">{label}</p>
                          <MoneyInput valueAud={inputs[key]} onChange={v => onChange({ [key]: v } as Partial<Inputs>)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">CGT discount <span className="text-foreground-subtle text-[11px]">50% if held &gt; 12 mo</span></p>
                      <PctInput value={inputs.cgtDiscountPct} onChange={v => onChange({ cgtDiscountPct: v })} suffix="%" />
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-1">Marginal tax rate <span className="text-foreground-subtle text-[11px]">your top rate</span></p>
                      <PctInput value={inputs.cgtMarginalRatePct} onChange={v => onChange({ cgtMarginalRatePct: v })} suffix="%" />
                    </div>
                  </div>

                  <InputRow label="Depreciation claimed" hint="Div 40 — added back to the gain">
                    <MoneyInput valueAud={inputs.cgtDepreciationAud} onChange={v => onChange({ cgtDepreciationAud: v })} placeholder="0" />
                  </InputRow>

                  <p className="text-[11px] text-foreground-subtle leading-snug">
                    The cost base also includes the <strong>selling costs</strong> entered above. An estimate only — a large gain can span tax brackets, so confirm with your accountant.
                  </p>
                </div>
              )}
            </Collapsible>
          </div>
        </div>
      </div>

      {/* Step 2: Reinvestment */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 pt-4 pb-5">
        <StepHeader n={2} title="Reinvestment costs" />

        {/* Fixed purchase price note */}
        <div className="flex items-start justify-between mb-4 px-3 py-2.5 rounded-lg bg-surface-sunken/60">
          <span className="text-xs text-foreground-muted">New purchase price</span>
          <div className="text-right">
            <span className="text-sm font-semibold tabular-nums text-ink">
              {inputs.salePriceAud > 0 ? fmtMo(Math.round(inputs.salePriceAud * 100)) : '—'}
            </span>
            <span className="block text-[10px] text-foreground-subtle">Fixed to sale price</span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Collapsible
            title="Buying costs"
            summary={buyingCount > 0 ? `${buyingCount} item${buyingCount !== 1 ? 's' : ''} · ${fmtMo(buyingTotal * 100)}` : 'Optional — none added'}
            open={buyingOpen}
            onToggle={() => setBuyingOpen(o => !o)}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([
                ['Stamp duty', 'stampDutyAud'],
                ['Legal & conveyancing', 'buyingLegalAud'],
                ['Building & pest', 'buildingPestAud'],
                ['Other costs', 'buyingOtherAud'],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <p className="text-xs text-foreground-muted mb-1">{label}</p>
                  <MoneyInput valueAud={inputs[key]} onChange={v => onChange({ [key]: v } as Partial<Inputs>)} />
                </div>
              ))}
            </div>
          </Collapsible>

          {/* New loan */}
          <div>
            <SectionLabel>New loan</SectionLabel>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-foreground-muted mb-1.5">Rate</p>
                  <PctInput value={inputs.newLoanRatePct} onChange={v => onChange({ newLoanRatePct: v })} suffix="% p.a." />
                </div>
                <div>
                  <p className="text-xs text-foreground-muted mb-1.5">Type</p>
                  <div className="flex border border-border rounded overflow-hidden text-sm">
                    <button type="button" className={`flex-1 py-2 text-center text-xs transition-colors ${inputs.newLoanType === 'interest_only' ? 'bg-foreground-muted text-white font-medium' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`} onClick={() => onChange({ newLoanType: 'interest_only' })}>IO</button>
                    <button type="button" className={`flex-1 py-2 text-center text-xs transition-colors border-l border-border ${inputs.newLoanType === 'principal_and_interest' ? 'bg-foreground-muted text-white font-medium' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`} onClick={() => onChange({ newLoanType: 'principal_and_interest' })}>P&amp;I</button>
                  </div>
                </div>
              </div>
              <InputRow label="Term">
                <NumInput value={inputs.newLoanTermYears} onChange={v => onChange({ newLoanTermYears: v })} suffix="yr" />
              </InputRow>
            </div>
          </div>

          {/* LMI — conditional */}
          {lmiRequired && (
            <div className="border border-border rounded-lg p-3 bg-surface">
              <div className="flex items-start gap-2 mb-3">
                <span className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold bg-negative/10 text-negative">LMI likely</span>
                <p className="text-xs text-foreground-muted">
                  New loan is <strong className="text-ink">{fmtPct((result?.reinvestSummary.lvrRatio ?? 0) * 100, 1)}</strong> of the purchase price — over the 80% threshold.
                </p>
              </div>
              <InputRow label="LMI estimate" hint="Added to the new loan">
                <MoneyInput valueAud={inputs.lmiAud} onChange={v => onChange({ lmiAud: v })} />
              </InputRow>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Comparison */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 pt-4 pb-5">
        <StepHeader n={3} title="Comparison" />
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-foreground-muted mb-1.5">Growth if held</p>
              <PctInput value={inputs.holdGrowthRatePct} onChange={v => onChange({ holdGrowthRatePct: v })} suffix="% p.a." />
              <p className="text-[11px] text-foreground-subtle mt-1">Current property</p>
            </div>
            <div>
              <p className="text-xs text-foreground-muted mb-1.5">Growth if reinvested</p>
              <PctInput value={inputs.reinvestGrowthRatePct} onChange={v => onChange({ reinvestGrowthRatePct: v })} suffix="% p.a." />
              <p className="text-[11px] text-foreground-subtle mt-1">New market</p>
            </div>
          </div>

          <InputRow label="Time horizon">
            <div className="flex border border-border rounded overflow-hidden text-sm">
              {HORIZONS.map((h, i) => (
                <button
                  key={h}
                  type="button"
                  className={`flex-1 py-2 text-center text-xs transition-colors ${i > 0 ? 'border-l border-border' : ''} ${inputs.horizonYears === h ? 'bg-foreground-muted text-white font-medium' : 'bg-surface text-foreground-muted hover:bg-surface-sunken'}`}
                  onClick={() => onChange({ horizonYears: h })}
                >
                  {h}yr
                </button>
              ))}
            </div>
          </InputRow>
        </div>
      </div>
    </div>
  )
}

// ── Equity trajectory chart ───────────────────────────────────────────────────

const chartConfig = {
  hold: { label: 'Hold', color: 'hsl(188 32% 32%)' },
  reinvest: { label: 'Sell & reinvest', color: 'hsl(30 70% 45%)' },
}

function EquityChart({
  result,
  horizonYears,
}: {
  result: HoldReinvestResult
  horizonYears: number
}) {
  const data = result.trajectories.holdEquityByYear.map((hold, yr) => ({
    year: yr,
    holdK: Math.round(hold / 10000) / 10, // dollars in thousands (1 decimal)
    reinvestK: Math.round(result.trajectories.reinvestEquityByYear[yr] / 10000) / 10,
  }))

  const tickStep = horizonYears <= 5 ? 1 : horizonYears <= 10 ? 2 : 5
  const xTicks = Array.from({ length: Math.floor(horizonYears / tickStep) + 1 }, (_, i) => i * tickStep)
  if (xTicks[xTicks.length - 1] !== horizonYears) xTicks.push(horizonYears)

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <XAxis
          dataKey="year"
          ticks={xTicks}
          tickFormatter={yr => (yr === 0 ? 'Now' : `Yr ${yr}`)}
          tick={{ fontSize: 11, fill: 'hsl(34 5% 56%)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={v => `$${v}k`}
          tick={{ fontSize: 11, fill: 'hsl(34 5% 56%)' }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="border border-border bg-surface rounded-lg px-3 py-2 text-xs shadow-sm">
                <p className="text-foreground-muted mb-1">{label === 0 ? 'Now' : `Year ${label}`}</p>
                {payload.map(p => (
                  <p key={String(p.dataKey ?? '')} className="tabular-nums" style={{ color: p.color }}>
                    {p.dataKey === 'holdK' ? 'Hold' : 'Reinvest'}: ${(Array.isArray(p.value) ? 0 : Number(p.value)).toLocaleString('en-AU')}k
                  </p>
                ))}
              </div>
            )
          }}
        />
        {result.breakEvenYear !== null && (
          <ReferenceLine
            x={result.breakEvenYear}
            stroke="hsl(36 12% 70%)"
            strokeWidth={1}
            strokeDasharray="4 3"
            label={{ value: `Yr ${result.breakEvenYear}`, position: 'top', fontSize: 10, fill: 'hsl(34 5% 56%)' }}
          />
        )}
        <Line
          dataKey="holdK"
          name="Hold"
          stroke={chartConfig.hold.color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="reinvestK"
          name="Sell & reinvest"
          stroke={chartConfig.reinvest.color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          strokeDasharray="5 3"
        />
      </ComposedChart>
    </ChartContainer>
  )
}

// ── Modeling assumptions ──────────────────────────────────────────────────────

const ASSUMPTIONS = [
  ['Purchase price = sale price', 'Equal-value baseline — isolates growth rate vs friction, not asset scale.'],
  ['All net proceeds go to deposit', 'No outside cash injected. Deposit = sale proceeds minus all costs.'],
  ['Loan balance held constant', 'Principal repayments, offset balances and debt recycling are excluded.'],
  ['Growth applies to full property value', 'Leveraged returns — growth compounds on the full value, not just equity.'],
  ['No rental income or expenses', 'Pure capital-growth comparison. Cashflow differences are out of scope.'],
  ['CGT and stamp duty are your estimates', 'Speak to your accountant. Accuracy depends on ownership history, depreciation and marginal rate.'],
] as const

// ── Summaries panel (top-right column) ───────────────────────────────────────

function SummariesPanel({
  inputs,
  result,
  cgtCents,
  cgtEstimate,
}: {
  inputs: Inputs
  result: HoldReinvestResult | null
  cgtCents: number
  cgtEstimate: CgtEstimateResult | null
}) {
  if (!result || inputs.salePriceAud === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-3xl font-display text-foreground-muted">Hold vs Reinvest</p>
        <p className="mt-3 text-sm text-foreground-subtle max-w-[28ch]">
          Select a property and enter a sale price to see the comparison.
        </p>
      </div>
    )
  }

  const { saleSummary, reinvestSummary } = result
  const commissionCents = Math.round(inputs.salePriceAud * 100 * inputs.commissionPct / 100)

  return (
    <div className="flex flex-col gap-6">
      {/* Sale ledger */}
      <div>
        <SectionLabel>Sale — what you walk away with</SectionLabel>
        <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
          <LedgerRow label="Sale price" value={fmtMo(Math.round(inputs.salePriceAud * 100))} />
          <LedgerRow label="Agent commission" sub={`${inputs.commissionPct}% of sale`} value={`−${fmtMo(commissionCents)}`} />
          {inputs.sellingLegalAud > 0 && <LedgerRow label="Legal fees" value={`−${fmtMo(Math.round(inputs.sellingLegalAud * 100))}`} />}
          {inputs.sellingMarketingAud > 0 && <LedgerRow label="Marketing" value={`−${fmtMo(Math.round(inputs.sellingMarketingAud * 100))}`} />}
          {inputs.sellingOtherAud > 0 && <LedgerRow label="Other selling costs" value={`−${fmtMo(Math.round(inputs.sellingOtherAud * 100))}`} />}
          {saleSummary.loanPayoutsCents > 0 && (
            <LedgerRow label="Loan payouts" sub="outstanding balances" value={`−${fmtMo(saleSummary.loanPayoutsCents)}`} />
          )}
          <LedgerRow label="Net cash after loans" value={fmtMo(saleSummary.netAfterLoansCents)} total positive={saleSummary.netAfterLoansCents > 0} />
          {inputs.cgtMode === 'estimate' && cgtEstimate && !cgtEstimate.isCapitalLoss && (
            <>
              <LedgerRow label="Estimated CGT" value={`−${fmtMo(cgtCents)}`} />
              <LedgerRow label="Net cash after CGT" value={fmtMo(saleSummary.netAfterCgtCents)} total positive={saleSummary.netAfterCgtCents > 0} />
            </>
          )}
          {inputs.cgtMode === 'manual' && inputs.cgtManualAud > 0 && (
            <>
              <LedgerRow label="CGT — your figure" value={`−${fmtMo(cgtCents)}`} />
              <LedgerRow label="Net cash after CGT" value={fmtMo(saleSummary.netAfterCgtCents)} total positive={saleSummary.netAfterCgtCents > 0} />
            </>
          )}
        </div>
        {inputs.cgtMode === 'manual' && inputs.cgtManualAud === 0 && (
          <p className="text-[11px] text-foreground-subtle mt-1.5 px-1">
            CGT not entered — switch to Estimate or enter your accountant&apos;s figure in Step 1.
          </p>
        )}
      </div>

      {/* Reinvest ledger */}
      <div>
        <SectionLabel>Reinvestment — the new position</SectionLabel>
        <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
          <LedgerRow label="Purchase price" sub="= sale price" value={fmtMo(reinvestSummary.purchasePriceCents)} />
          {inputs.stampDutyAud > 0 && <LedgerRow label="Stamp duty" value={`−${fmtMo(Math.round(inputs.stampDutyAud * 100))}`} />}
          {inputs.buyingLegalAud > 0 && <LedgerRow label="Legal & conveyancing" value={`−${fmtMo(Math.round(inputs.buyingLegalAud * 100))}`} />}
          {inputs.buildingPestAud > 0 && <LedgerRow label="Building & pest" value={`−${fmtMo(Math.round(inputs.buildingPestAud * 100))}`} />}
          {inputs.buyingOtherAud > 0 && <LedgerRow label="Other buying costs" value={`−${fmtMo(Math.round(inputs.buyingOtherAud * 100))}`} />}
          <LedgerRow label="Net deposit" value={fmtMo(reinvestSummary.netDepositCents)} total positive={reinvestSummary.netDepositCents > 0} />
        </div>

        {result.blocked ? (
          <div className="mt-3 flex items-start gap-2.5 px-3 py-3 rounded-lg border border-negative/30 bg-negative/5">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-negative/10 text-negative text-xs flex items-center justify-center font-semibold">!</span>
            <div>
              <p className="text-sm font-medium text-negative">Reinvestment can't be modelled at this price</p>
              <p className="text-xs text-foreground-muted mt-0.5">{result.blockedReason}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="border border-border rounded-lg p-3 bg-surface-raised">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle mb-1">New loan</p>
              <p className="text-base font-semibold tabular-nums text-ink">{fmtShort(reinvestSummary.effectiveNewLoanCents)}</p>
              {result.showLmi && inputs.lmiAud > 0 && (
                <p className="text-[11px] text-foreground-subtle">incl. {fmtShort(Math.round(inputs.lmiAud * 100))} LMI</p>
              )}
            </div>
            <div className={`border rounded-lg p-3 bg-surface-raised ${result.showLmi ? 'border-negative/40' : 'border-border'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle mb-1">LVR</p>
              <p className={`text-base font-semibold tabular-nums ${result.showLmi ? 'text-negative' : 'text-ink'}`}>
                {fmtPct(reinvestSummary.lvrRatio * 100)}
              </p>
              {result.showLmi && <p className="text-[11px] text-negative/80">LMI territory</p>}
            </div>
            <div className="border border-border rounded-lg p-3 bg-surface-raised col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle mb-1">New repayment</p>
              <p className="text-base font-semibold tabular-nums text-ink">
                {fmtMo(reinvestSummary.newLoanRepaymentMonthlyCents)}<span className="text-sm font-normal text-foreground-muted"> / mo</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Analysis section (full-width bottom) ──────────────────────────────────────

function AnalysisSection({
  inputs,
  result,
}: {
  inputs: Inputs
  result: HoldReinvestResult | null
}) {
  if (!result || inputs.salePriceAud === 0 || result.blocked) {
    return null
  }

  const horizon = inputs.horizonYears
  const holdAtN = result.trajectories.holdEquityByYear[horizon]
  const reinvestAtN = result.trajectories.reinvestEquityByYear[horizon]
  const holdGain = holdAtN - result.trajectories.holdEquityByYear[0]
  const reinvestGain = reinvestAtN - result.trajectories.reinvestEquityByYear[0]
  const holdValueAtN = Math.round(Math.round(inputs.salePriceAud * 100) * Math.pow(1 + inputs.holdGrowthRatePct / 100, horizon))
  const reinvestValueAtN = Math.round(Math.round(inputs.salePriceAud * 100) * Math.pow(1 + inputs.reinvestGrowthRatePct / 100, horizon))

  return (
    <div className="flex flex-col gap-6">
      {/* Friction banner */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-1">Switching cost</p>
            <p className="text-2xl font-display tabular-nums text-ink">{fmtMo(result.frictionCents)}</p>
            <p className="text-xs text-foreground-muted mt-0.5">{fmtPct(result.frictionPct)} of property value — equity gap reinvesting must recover to outperform holding</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-subtle mb-1">Break-even</p>
            {result.breakEvenYear !== null ? (
              <>
                <p className="text-2xl font-display text-ink">Yr {result.breakEvenYear}</p>
                <p className="text-xs text-foreground-muted mt-0.5">reinvest overtakes hold</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-display text-foreground-muted">Never</p>
                <p className="text-xs text-foreground-subtle mt-0.5">within {inputs.horizonYears} yrs</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cashflow note */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-surface-sunken/60 text-xs text-foreground-muted">
        <span className="flex-shrink-0 font-bold">↓</span>
        <span>Reinvesting also requires servicing a larger loan — this comparison measures equity growth only, not the higher monthly repayments.</span>
      </div>

      {/* Chart */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Equity over {inputs.horizonYears} years</SectionLabel>
          <div className="flex items-center gap-4 text-[11px] text-foreground-muted pb-3">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-[2px] bg-[hsl(188_32%_32%)] inline-block" /> Hold
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-[2px] border-t-2 border-dashed border-[hsl(30_70%_45%)] inline-block" /> Reinvest
            </span>
          </div>
        </div>
        <div className="border border-border rounded-xl bg-surface-raised p-4 overflow-hidden">
          <EquityChart result={result} horizonYears={inputs.horizonYears} />
          {result.breakEvenYear === null && (
            <p className="text-xs text-foreground-muted mt-3">
              Reinvest growth ({fmtPct(inputs.reinvestGrowthRatePct)}) is at or below hold growth ({fmtPct(inputs.holdGrowthRatePct)}) — the reinvested path never overtakes holding within this horizon. The switching cost is permanent.
            </p>
          )}
        </div>
      </div>

      {/* Comparison tiles */}
      <div>
        <SectionLabel>Comparison at year {inputs.horizonYears}</SectionLabel>
        <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 border-b border-rule bg-surface-sunken/40">
            <div className="py-2 px-2" />
            <div className="py-2 px-2 border-l border-rule/60">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle">Hold</span>
            </div>
            <div className="py-2 px-2 border-l border-rule/60">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-subtle">Reinvest</span>
            </div>
          </div>
          <CompareTile
            label="Equity today"
            hold={fmtMo(result.trajectories.holdEquityByYear[0])}
            reinvest={fmtMo(result.trajectories.reinvestEquityByYear[0])}
            reinvestSub="after friction"
          />
          <CompareTile
            label={`Equity at yr ${horizon}`}
            hold={fmtMo(holdAtN)}
            reinvest={fmtMo(reinvestAtN)}
          />
          <CompareTile
            label={`Est. value at yr ${horizon}`}
            hold={fmtMo(holdValueAtN)}
            reinvest={fmtMo(reinvestValueAtN)}
          />
          <CompareTile
            label="Gain over horizon"
            hold={`+${fmtMo(holdGain)}`}
            reinvest={`+${fmtMo(reinvestGain)}`}
          />
          <CompareTile
            label="Break-even"
            hold="—"
            reinvest={result.breakEvenYear !== null ? `Year ${result.breakEvenYear}` : `Beyond ${horizon} yrs`}
            footer
          />
        </div>
      </div>

      {/* Assumptions */}
      <div className="border border-border rounded-xl bg-surface-raised px-5 py-4">
        <p className="text-xs font-semibold text-ink mb-3">
          Modelling assumptions
          <span className="ml-2 text-[11px] font-normal text-foreground-subtle">load-bearing for these projections</span>
        </p>
        <div className="grid grid-cols-1 gap-3">
          {ASSUMPTIONS.map(([title, body]) => (
            <div key={title}>
              <p className="text-xs font-medium text-ink">{title}</p>
              <p className="text-[11px] text-foreground-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HoldReinvestPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS)

  useEffect(() => {
    let currentController: AbortController | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const load = (isRefresh = false) => {
      if (currentController) currentController.abort()
      if (timeoutId) clearTimeout(timeoutId)
      currentController = new AbortController()
      const { signal } = currentController
      timeoutId = setTimeout(() => currentController?.abort(), 15_000)

      fetch('/api/plan/context', { signal })
        .then(res => {
          if (res.status === 401) { router.push('/login'); return null }
          return res.json()
        })
        .then(body => {
          if (!body) return
          if (body.context) {
            setPageState({ status: 'loaded', context: body.context })
            setInputs(prev =>
              body.context.properties.some((p: { id: string }) => p.id === prev.selectedPropertyId)
                ? prev
                : { ...prev, selectedPropertyId: '', salePriceAud: 0 },
            )
          } else if (!isRefresh) {
            setPageState({ status: 'error' })
          }
        })
        .catch(err => {
          if ((err as DOMException).name === 'AbortError') return
          if (!isRefresh) setPageState({ status: 'error' })
        })
    }
    load()
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => {
      if (currentController) currentController.abort()
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('focus', onFocus)
    }
  }, [router])

  const handleChange = useCallback((patch: Partial<Inputs>) => {
    setInputs(prev => ({ ...prev, ...patch }))
  }, [])

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

  // Derive selling costs total (used in CGT cost base for estimate mode)
  const salePriceCents = Math.round(inputs.salePriceAud * 100)
  const commissionCentsForCgt = Math.round(salePriceCents * inputs.commissionPct / 100)
  const sellingCostsTotalCents =
    commissionCentsForCgt +
    Math.round(inputs.sellingLegalAud * 100) +
    Math.round(inputs.sellingMarketingAud * 100) +
    Math.round(inputs.sellingOtherAud * 100)

  // Compute CGT estimate (always computed when sale price is set; used in estimate mode)
  const cgtEstimate: CgtEstimateResult | null =
    inputs.salePriceAud > 0
      ? computeCgtEstimate({
          salePriceCents,
          purchasePriceCents: Math.round(inputs.cgtPurchasePriceAud * 100),
          costsCents: {
            stampDuty: Math.round(inputs.cgtCostStampDutyAud * 100),
            legal: Math.round(inputs.cgtCostLegalAud * 100),
            buildingPest: Math.round(inputs.cgtCostBuildingPestAud * 100),
            buyerAgent: Math.round(inputs.cgtCostBuyerAgentAud * 100),
            improvements: Math.round(inputs.cgtCostImprovementsAud * 100),
          },
          sellingCostsTotalCents,
          depreciationCents: Math.round(inputs.cgtDepreciationAud * 100),
          discountPct: inputs.cgtDiscountPct,
          marginalRatePct: inputs.cgtMarginalRatePct,
        })
      : null

  const cgtCents =
    inputs.cgtMode === 'manual'
      ? Math.round(inputs.cgtManualAud * 100)
      : (cgtEstimate?.estimatedCgtCents ?? 0)

  // Compute result (null when no property selected or no sale price)
  let result: HoldReinvestResult | null = null
  if (inputs.selectedPropertyId && inputs.salePriceAud > 0) {
    result = computeHoldReinvest({
      selectedPropertyId: inputs.selectedPropertyId,
      salePriceCents,
      cgtCents,
      newLoanRatePct: inputs.newLoanRatePct,
      newLoanTermYears: inputs.newLoanTermYears,
      newLoanType: inputs.newLoanType,
      lmiAmountCents: Math.round(inputs.lmiAud * 100),
      holdGrowthRatePct: inputs.holdGrowthRatePct,
      reinvestGrowthRatePct: inputs.reinvestGrowthRatePct,
      horizonYears: inputs.horizonYears,
      sellingCosts: {
        commissionPct: inputs.commissionPct,
        legalCents: Math.round(inputs.sellingLegalAud * 100),
        marketingCents: Math.round(inputs.sellingMarketingAud * 100),
        otherCents: Math.round(inputs.sellingOtherAud * 100),
      },
      buyingCosts: {
        stampDutyCents: Math.round(inputs.stampDutyAud * 100),
        legalCents: Math.round(inputs.buyingLegalAud * 100),
        buildingPestCents: Math.round(inputs.buildingPestAud * 100),
        otherCents: Math.round(inputs.buyingOtherAud * 100),
      },
      loans: context.loans,
    })
  }

  return (
    <div className="max-w-[1100px]">
      <BackToScenarios />

      <div className="border border-border rounded-xl bg-surface overflow-clip">
        {/* Header */}
        <div className="px-6 py-5 border-b border-rule">
          <h1 className="font-display text-xl text-ink">Hold vs Sell and Reinvest</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Would your capital work harder in a different market — after the cost of getting there?
          </p>
        </div>

        {/* Top: two columns — inputs | summaries */}
        <div className="grid grid-cols-2 items-start border-b border-rule">
          {/* Left: inputs */}
          <div className="border-r border-rule p-6">
            <InputsPanel
              inputs={inputs}
              result={result}
              properties={context.properties}
              onChange={handleChange}
              cgtCents={cgtCents}
              cgtEstimate={cgtEstimate}
            />
          </div>
          {/* Right: sale + reinvestment ledgers */}
          <div className="bg-surface-sunken/40 p-6">
            <SummariesPanel inputs={inputs} result={result} cgtCents={cgtCents} cgtEstimate={cgtEstimate} />
          </div>
        </div>

        {/* Bottom: full-width analysis — switching cost, chart, comparison, assumptions */}
        <div className="p-6 border-t border-rule">
          <AnalysisSection inputs={inputs} result={result} />
        </div>
      </div>
    </div>
  )
}
