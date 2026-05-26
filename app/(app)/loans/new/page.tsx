'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import type { Property, Entity } from '@/db/schema'
import { formatCents } from '@/lib/format'
import { useSidebar } from '@/components/sidebar-context'

// ─── Types ────────────────────────────────────────────────────────────────────

type RepaymentType = 'io' | 'pi' | 'loc'
type SecurityMode  = 'secured' | 'unsecured'

// ─── Lender data ─────────────────────────────────────────────────────────────

const PRESET_LENDERS = [
  { value: 'Commonwealth Bank', glyph: 'CBA' },
  { value: 'Westpac',           glyph: 'W'   },
  { value: 'ANZ',               glyph: 'ANZ' },
  { value: 'NAB',               glyph: 'NAB' },
  { value: 'Macquarie',         glyph: 'M'   },
  { value: 'Other',             glyph: '···' },
] as const

type PresetLender = (typeof PRESET_LENDERS)[number]['value']

// ─── Sub-components ───────────────────────────────────────────────────────────

function SegToggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex border border-border rounded-md overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'px-4 py-1.5 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-ink text-white'
              : 'bg-surface text-muted hover:bg-screen-bg',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="text-xs font-medium text-ink">
      {children}
      {optional && <span className="ml-1.5 text-muted font-normal">(optional)</span>}
    </label>
  )
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted mt-0.5">{children}</p>
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-[22px] h-[22px] rounded-full bg-screen-bg border border-border text-muted text-xs font-semibold flex items-center justify-center flex-shrink-0 tabular-nums">
      {n}
    </span>
  )
}

function SectionHead({
  step,
  title,
  sub,
  right,
}: {
  step: number
  title: string
  sub: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-rule">
      <div className="flex items-center gap-3">
        <StepBadge n={step} />
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-xs text-muted mt-px">{sub}</p>
        </div>
      </div>
      {right}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewLoanPage() {
  const router = useRouter()
  const { refresh: refreshSidebar } = useSidebar()

  // Data
  const [properties, setProperties] = useState<Property[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loadingProps, setLoadingProps] = useState(true)

  // Section 1 — Lender & account
  const [selectedLender, setSelectedLender] = useState<PresetLender | null>(null)
  const [customLender, setCustomLender] = useState('')
  const [accountReference, setAccountReference] = useState('')
  const [nickname, setNickname] = useState('')

  // Section 2 — Security
  const [securityMode, setSecurityMode] = useState<SecurityMode>('secured')
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  // Section 3 — Loan terms
  const [repayment, setRepayment] = useState<RepaymentType>('io')
  const [startDate, setStartDate] = useState('')
  const [loanTermYears, setLoanTermYears] = useState('')
  const [originalAmount, setOriginalAmount] = useState('')
  const [ioEndDate, setIoEndDate] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [rateType, setRateType] = useState<'variable' | 'fixed' | ''>('')

  // Section 4 — Opening balance
  const [balanceDollars, setBalanceDollars] = useState('')
  const [balanceDate, setBalanceDate] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/properties').then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json() as Promise<{ properties?: Property[] }>
      }),
      fetch('/api/entities').then(r => r.json() as Promise<{ entities?: Entity[] }>),
    ])
      .then(([propsData, entData]) => {
        const props = propsData?.properties ?? []
        setProperties(props)
        if (props.length === 1) setSelectedPropertyId(props[0].id)
        setEntities(entData?.entities ?? [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoadingProps(false))
  }, [router])

  const lenderValue = selectedLender === 'Other' ? customLender.trim() : (selectedLender ?? '')
  const isValid = lenderValue.length > 0 && (securityMode === 'unsecured' || selectedPropertyId !== null)

  async function handleSubmit() {
    if (!isValid) return
    setSaving(true)

    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender: lenderValue,
          nickname: nickname.trim() || undefined,
          accountReference: accountReference.trim() || undefined,
          propertyId: securityMode === 'secured' ? selectedPropertyId : null,
          entityId: selectedEntityId || undefined,
          loanType: repayment === 'io' ? 'interest_only'
                  : repayment === 'pi' ? 'principal_and_interest'
                  : 'line_of_credit',
          startDate: startDate || undefined,
          endDate: (() => {
            if (startDate && loanTermYears) {
              const d = new Date(startDate)
              d.setFullYear(d.getFullYear() + parseInt(loanTermYears, 10))
              return d.toISOString().slice(0, 10)
            }
            return undefined
          })(),
          ioEndDate: ioEndDate || undefined,
          interestRate: interestRate ? parseFloat(interestRate) : undefined,
          rateType: (rateType || undefined) as 'variable' | 'fixed' | undefined,
          loanTermYears: loanTermYears ? parseInt(loanTermYears, 10) : undefined,
          originalAmountCents: originalAmount
            ? Math.round(parseFloat(originalAmount.replace(/,/g, '')) * 100)
            : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to create loan')
        return
      }

      const { loan } = await res.json() as { loan: { id: string } }

      // Optional opening balance
      if (balanceDollars.trim() && balanceDate) {
        const balanceParsed = parseFloat(balanceDollars.replace(/,/g, ''))
        if (!isNaN(balanceParsed)) {
          const balanceCents = Math.round(balanceParsed * 100)
          const balRes = await fetch(`/api/loans/${loan.id}/balances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balanceCents, recordedAt: balanceDate }),
          })
          if (!balRes.ok) toast.warning('Loan created but opening balance could not be saved')
        }
      }

      refreshSidebar()
      toast.success('Loan added')
      router.push(`/loans/${loan.id}`)
    } finally {
      setSaving(false)
    }
  }

  const showIoPi = repayment !== 'loc'

  return (
    <div className="min-h-screen bg-screen-bg">
      <div className="max-w-[880px] mx-auto px-4 py-8">

        <Link
          href="/loans"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-5 transition-colors"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All loans
        </Link>

        <div className="mb-8">
          <h1 className="font-serif text-2xl text-ink">Add a loan</h1>
          <p className="text-sm text-muted mt-0.5">
            A snapshot is enough. Folio takes the running balance from your statements.
          </p>
        </div>

        <div className="space-y-5">

          {/* ===== 1. Lender & account ===== */}
          <div className="bg-surface border border-border rounded-lg">
            <SectionHead step={1} title="Lender & account" sub="Which bank holds the loan?" />
            <div className="p-6 space-y-6">

              {/* Bank picker */}
              <div>
                <FieldLabel>Lender</FieldLabel>
                <div className="flex flex-wrap gap-2 mt-3">
                  {PRESET_LENDERS.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setSelectedLender(preset.value as PresetLender)}
                      className={[
                        'flex items-center gap-0 border rounded-md text-sm transition-colors',
                        selectedLender === preset.value
                          ? 'border-accent bg-accent-light'
                          : 'border-border bg-surface hover:bg-screen-bg',
                      ].join(' ')}
                    >
                      <span className={[
                        'w-8 h-8 rounded-[5px] m-1 flex items-center justify-center text-xs font-bold text-white flex-shrink-0',
                        lenderGlyphBg(preset.value as PresetLender),
                      ].join(' ')}>
                        {preset.glyph}
                      </span>
                      <span className={[
                        'px-3 text-sm',
                        selectedLender === preset.value ? 'font-medium text-ink' : 'text-muted',
                      ].join(' ')}>
                        {preset.value === 'Other' ? 'Other' : preset.value}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedLender === 'Other' && (
                <div className="max-w-md">
                  <Input
                    autoFocus
                    placeholder="Lender name (e.g. ING, Bankwest, ubank)"
                    value={customLender}
                    onChange={e => setCustomLender(e.target.value)}
                  />
                  <HelpText>We&apos;ll use this as the lender label across Folio.</HelpText>
                </div>
              )}

              {/* Reference + Nickname */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <FieldLabel optional>Account / loan reference</FieldLabel>
                  <Input
                    className="mt-1.5"
                    placeholder="ending 4821"
                    value={accountReference}
                    onChange={e => setAccountReference(e.target.value)}
                  />
                  <HelpText>Last 4 digits are enough. Used to match statements.</HelpText>
                </div>
                <div>
                  <FieldLabel optional>Nickname</FieldLabel>
                  <Input
                    id="nickname"
                    className="mt-1.5"
                    placeholder="Inv Loan · Elm St"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                  />
                  <HelpText>How this loan appears in the sidebar.</HelpText>
                </div>
              </div>
            </div>
          </div>

          {/* ===== 2. Security ===== */}
          <div className="bg-surface border border-border rounded-lg">
            <SectionHead
              step={2}
              title="Security"
              sub="What does this loan borrow against?"
              right={
                <SegToggle
                  options={[
                    { value: 'secured',   label: 'Secured by property' },
                    { value: 'unsecured', label: 'Unsecured' },
                  ]}
                  value={securityMode}
                  onChange={v => {
                    setSecurityMode(v as SecurityMode)
                    if (v === 'unsecured') setSelectedPropertyId(null)
                  }}
                />
              }
            />
            <div className="p-6 space-y-5">

              {securityMode === 'secured' && (
                <div>
                  <FieldLabel>Property securing this loan</FieldLabel>
                  <div className="mt-3 divide-y divide-border border border-border rounded-lg overflow-hidden">
                    {loadingProps ? (
                      <div className="px-4 py-3 text-sm text-muted">Loading properties…</div>
                    ) : properties.length === 0 ? (
                      <Link
                        href="/properties/new"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-accent hover:bg-screen-bg transition-colors"
                      >
                        <span className="w-5 h-5 rounded border border-dashed border-border flex items-center justify-center text-muted">+</span>
                        Add a new property first
                      </Link>
                    ) : (
                      <>
                        {properties.map(prop => {
                          const isSelected = selectedPropertyId === prop.id
                          return (
                            <button
                              key={prop.id}
                              type="button"
                              onClick={() => setSelectedPropertyId(isSelected ? null : prop.id)}
                              className={[
                                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                                isSelected ? 'bg-accent-light' : 'hover:bg-screen-bg',
                              ].join(' ')}
                            >
                              <span className={[
                                'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                                isSelected ? 'border-accent bg-accent' : 'border-border',
                              ].join(' ')}>
                                {isSelected && (
                                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" aria-hidden>
                                    <polyline points="2,5 4.2,7.2 8,3"/>
                                  </svg>
                                )}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-ink">{prop.address}</p>
                                {prop.nickname && <p className="text-xs text-muted">{prop.nickname}</p>}
                              </div>
                            </button>
                          )
                        })}
                        <Link
                          href="/properties/new"
                          className="flex items-center gap-3 px-4 py-3 text-sm text-muted hover:bg-screen-bg transition-colors"
                        >
                          <span className="w-5 h-5 rounded border border-dashed border-border flex items-center justify-center">+</span>
                          Add a new property first
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Entity */}
              <div className="max-w-sm">
                <FieldLabel>Entity holding the loan</FieldLabel>
                <select
                  className="mt-1.5 w-full h-9 rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                  value={selectedEntityId ?? ''}
                  onChange={e => setSelectedEntityId(e.target.value || null)}
                >
                  <option value="">Select entity…</option>
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
                <div className="mt-1.5">
                  <Link href="/entities" className="text-xs text-accent hover:underline">
                    + Add a new entity
                  </Link>
                </div>
                <HelpText>
                  {securityMode === 'secured'
                    ? 'Usually matches the property\'s entity.'
                    : 'Which entity is liable for this loan.'}
                </HelpText>
              </div>
            </div>
          </div>

          {/* ===== 3. Loan terms ===== */}
          <div className="bg-surface border border-border rounded-lg">
            <SectionHead step={3} title="Loan terms" sub="From your loan contract or most recent statement." />
            <div className="p-6">

              <FieldLabel>Repayment type</FieldLabel>
              <div className="mt-3 mb-6">
                <SegToggle
                  options={[
                    { value: 'io',  label: 'Interest only' },
                    { value: 'pi',  label: 'Principal & interest' },
                    { value: 'loc', label: 'Line of credit' },
                  ]}
                  value={repayment}
                  onChange={v => setRepayment(v as RepaymentType)}
                />
              </div>

              <div className="grid grid-cols-2 gap-5">

                {showIoPi && (
                  <div>
                    <FieldLabel optional>Loan start date</FieldLabel>
                    <Input
                      id="start-date"
                      className="mt-1.5"
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                    />
                    <HelpText>From your loan contract.</HelpText>
                  </div>
                )}

                {showIoPi && (
                  <div>
                    <FieldLabel>Loan term</FieldLabel>
                    <div className="mt-1.5 flex">
                      <Input
                        id="loan-term-years"
                        className="rounded-r-none"
                        type="text"
                        inputMode="numeric"
                        placeholder="30"
                        value={loanTermYears}
                        onChange={e => setLoanTermYears(e.target.value)}
                      />
                      <span className="flex items-center px-3 text-sm text-muted bg-screen-bg border border-l-0 border-border rounded-r-md">years</span>
                    </div>
                    <HelpText>Total contract length.</HelpText>
                  </div>
                )}

                <div>
                  <FieldLabel optional={repayment !== 'loc'}>
                    {repayment === 'loc' ? 'Credit limit' : 'Original loan amount'}
                  </FieldLabel>
                  <div className="mt-1.5 flex">
                    <span className="flex items-center px-3 text-sm text-muted bg-screen-bg border border-r-0 border-border rounded-l-md">$</span>
                    <Input
                      className="rounded-l-none"
                      type="text"
                      inputMode="decimal"
                      placeholder="650,000"
                      value={originalAmount}
                      onChange={e => setOriginalAmount(e.target.value)}
                    />
                  </div>
                  <HelpText>
                    {repayment === 'loc'
                      ? 'Maximum you can draw down.'
                      : 'For tracking how much you\'ve paid down.'}
                  </HelpText>
                </div>

                {repayment === 'io' && (
                  <div>
                    <FieldLabel>IO period ends</FieldLabel>
                    <Input
                      className="mt-1.5"
                      type="date"
                      value={ioEndDate}
                      onChange={e => setIoEndDate(e.target.value)}
                    />
                    <HelpText>Folio prompts you 90 days before this date.</HelpText>
                  </div>
                )}

                <div>
                  <FieldLabel>Interest rate</FieldLabel>
                  <div className="mt-1.5 flex">
                    <Input
                      className="rounded-r-none"
                      type="text"
                      inputMode="decimal"
                      placeholder="6.35"
                      value={interestRate}
                      onChange={e => setInterestRate(e.target.value)}
                    />
                    <span className="flex items-center px-3 text-sm text-muted bg-screen-bg border border-l-0 border-border rounded-r-md whitespace-nowrap">% p.a.</span>
                  </div>
                  <HelpText>Current variable or fixed rate.</HelpText>
                </div>

                <div>
                  <FieldLabel>Rate type</FieldLabel>
                  <select
                    className="mt-1.5 w-full h-9 rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                    value={rateType}
                    onChange={e => setRateType(e.target.value as 'variable' | 'fixed' | '')}
                  >
                    <option value="">Select…</option>
                    <option value="variable">Variable</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  <HelpText>&nbsp;</HelpText>
                </div>

              </div>
            </div>
          </div>

          {/* ===== 4. Opening balance ===== */}
          <div className="bg-surface border border-border rounded-lg">
            <SectionHead
              step={4}
              title="Opening balance snapshot"
              sub="The current balance on your most recent statement. Folio tracks changes from here."
            />
            <div className="p-6">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <FieldLabel>Current balance</FieldLabel>
                  <div className="mt-1.5 flex">
                    <span className="flex items-center px-3 text-sm text-muted bg-screen-bg border border-r-0 border-border rounded-l-md">$</span>
                    <Input
                      className="rounded-l-none"
                      type="text"
                      inputMode="decimal"
                      placeholder="615,000"
                      value={balanceDollars}
                      onChange={e => setBalanceDollars(e.target.value)}
                    />
                  </div>
                  <HelpText>From your latest statement.</HelpText>
                </div>
                <div>
                  <FieldLabel>As of</FieldLabel>
                  <Input
                    className="mt-1.5"
                    type="date"
                    value={balanceDate}
                    onChange={e => setBalanceDate(e.target.value)}
                  />
                  <HelpText>Statement date.</HelpText>
                </div>
              </div>

              {balanceDollars && balanceDate && !isNaN(parseFloat(balanceDollars.replace(/,/g, ''))) && (
                <p className="mt-4 text-xs text-muted bg-screen-bg rounded px-3 py-2">
                  Will record{' '}
                  <span className="font-semibold text-ink">
                    {formatCents(Math.round(parseFloat(balanceDollars.replace(/,/g, '')) * 100))}
                  </span>{' '}
                  as of {balanceDate}.
                </p>
              )}
            </div>
          </div>

          {/* ===== Commit footer ===== */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-sm text-muted">
              {lenderValue && (
                <>
                  Will add <strong className="text-ink">{lenderValue}{nickname ? ` · ${nickname}` : ''}</strong>
                  {securityMode === 'secured' && selectedPropertyId && (() => {
                    const prop = properties.find(p => p.id === selectedPropertyId)
                    return prop ? <> secured by <strong className="text-ink">{prop.nickname ?? prop.address}</strong></> : null
                  })()}
                  {balanceDollars && !isNaN(parseFloat(balanceDollars.replace(/,/g, ''))) && (
                    <span className="text-muted"> · {formatCents(Math.round(parseFloat(balanceDollars.replace(/,/g, '')) * 100))} balance</span>
                  )}
                </>
              )}
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => router.push('/loans')}
                disabled={saving}
                className="px-4 py-2 text-sm border border-border rounded-md text-muted hover:text-ink hover:bg-screen-bg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isValid || saving}
                className="px-5 py-2 text-sm font-medium bg-ink text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Add loan'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lenderGlyphBg(lender: PresetLender): string {
  switch (lender) {
    case 'Commonwealth Bank': return 'bg-[hsl(212_48%_30%)]'
    case 'Westpac':           return 'bg-[hsl(0_65%_38%)]'
    case 'ANZ':               return 'bg-[hsl(208_70%_36%)]'
    case 'NAB':               return 'bg-[hsl(2_60%_36%)]'
    case 'Macquarie':         return 'bg-[hsl(0_0%_12%)]'
    default:                  return 'bg-muted/50'
  }
}
