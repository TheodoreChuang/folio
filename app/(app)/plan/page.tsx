'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanContext } from '@/lib/aggregate/plan/context'

// ── Types ─────────────────────────────────────────────────────────────────────

type State =
  | { status: 'loading' }
  | { status: 'loaded'; context: PlanContext }
  | { status: 'error' }

type CardDef = {
  eyebrow: string
  title: string
  question: string
  ctaLabel: string
  href: string
  metaFn: (ctx: PlanContext) => string | null
  disabledWhen: (ctx: PlanContext) => boolean
  disabledReason: string
}

// ── Card definitions ──────────────────────────────────────────────────────────

const CARDS: CardDef[] = [
  {
    eyebrow: 'If conditions change',
    title: 'Rate sensitivity',
    question: 'Can you handle a rate rise of 1%?',
    ctaLabel: 'Model rate scenarios',
    href: '/plan/rate-sensitivity',
    metaFn: ctx =>
      ctx.counts.variableLoans > 0
        ? `${ctx.counts.variableLoans} variable loan${ctx.counts.variableLoans !== 1 ? 's' : ''}`
        : null,
    disabledWhen: ctx => ctx.counts.variableLoans === 0,
    disabledReason: 'Add a variable loan to model rate scenarios',
  },
  {
    eyebrow: 'If conditions change',
    title: 'Interest-only rollover',
    question: 'When your interest-only period ends, can you cover the payment jump?',
    ctaLabel: 'See the schedule',
    href: '/plan/interest-only',
    metaFn: ctx =>
      ctx.counts.ioLoans > 0
        ? `${ctx.counts.ioLoans} IO loan${ctx.counts.ioLoans !== 1 ? 's' : ''}`
        : null,
    disabledWhen: ctx => ctx.counts.ioLoans === 0,
    disabledReason: 'Add an interest-only loan with an end date',
  },
  {
    eyebrow: 'If you change the portfolio',
    title: 'Model a purchase',
    question: 'Ready for your next property?',
    ctaLabel: 'Model a purchase',
    href: '/plan/model-purchase',
    metaFn: () => null,
    disabledWhen: () => false,
    disabledReason: '',
  },
  {
    eyebrow: 'If you change the portfolio',
    title: 'Hold or reinvest',
    question: 'Would your capital work harder in a different market?',
    ctaLabel: 'Hold or reinvest',
    href: '/plan/hold-reinvest',
    metaFn: ctx =>
      ctx.counts.properties > 0
        ? `${ctx.counts.properties} propert${ctx.counts.properties !== 1 ? 'ies' : 'y'}`
        : null,
    disabledWhen: ctx => ctx.counts.properties === 0,
    disabledReason: 'Add a property to model a sale',
  },
]

// ── Lock icon ─────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className="text-foreground-faint shrink-0"
    >
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

// ── Scenario card ─────────────────────────────────────────────────────────────

function ScenarioCard({ card, context }: { card: CardDef; context: PlanContext | null }) {
  const router = useRouter()
  const disabled = context !== null && card.disabledWhen(context)
  const meta = context !== null ? card.metaFn(context) : null

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="relative text-left bg-surface-sunken/40 border border-border rounded-[10px] px-6 pt-6 pb-5 flex flex-col gap-4 min-h-[196px] overflow-hidden"
      >
        <span className="text-[11px] uppercase tracking-[0.1em] text-foreground-faint font-semibold">
          {card.eyebrow}
        </span>
        <div className="font-semibold text-base tracking-[-0.01em] text-foreground-subtle">
          {card.title}
        </div>
        <p className="font-display font-normal text-xl leading-snug tracking-[-0.005em] text-foreground-subtle text-pretty m-0">
          {card.question}
        </p>
        <div className="flex items-center mt-auto pt-4 border-t border-ruled text-[13px] text-foreground-subtle">
          <span className="inline-flex items-center gap-[7px] font-medium">
            <LockIcon />
            {card.disabledReason}
          </span>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => router.push(card.href)}
      className="group relative text-left bg-surface border border-border rounded-[10px] px-6 pt-6 pb-5 flex flex-col gap-4 min-h-[196px] overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-[hsl(36_12%_76%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:border-accent"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px] bg-accent opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      />
      <span className="text-[11px] uppercase tracking-[0.1em] text-foreground-subtle font-semibold">
        {card.eyebrow}
      </span>
      <div className="font-semibold text-base tracking-[-0.01em] text-ink">
        {card.title}
      </div>
      <p className="font-display font-normal text-xl leading-snug tracking-[-0.005em] text-ink text-pretty m-0">
        {card.question}
      </p>
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-ruled text-[13px] font-medium text-accent">
        <span className="inline-flex items-center gap-1.5">
          {card.ctaLabel}
          <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
        </span>
        {meta && (
          <span className="text-foreground-subtle font-normal text-xs">{meta}</span>
        )}
      </div>
    </button>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-[10px] px-6 pt-6 pb-5 flex flex-col gap-4 min-h-[196px] animate-pulse">
      <div className="h-2.5 w-28 bg-border rounded-sm" />
      <div className="h-5 w-36 bg-border rounded-sm" />
      <div className="flex flex-col gap-1.5">
        <div className="h-4 w-full bg-border/70 rounded-sm" />
        <div className="h-4 w-3/4 bg-border/70 rounded-sm" />
      </div>
      <div className="mt-auto pt-4 border-t border-ruled">
        <div className="h-4 w-32 bg-border/50 rounded-sm" />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/plan/context')
      .then(res => res.json())
      .then(body => {
        if (body.context) {
          setState({ status: 'loaded', context: body.context })
        } else {
          setState({ status: 'error' })
        }
      })
      .catch(() => setState({ status: 'error' }))
  }, [])

  const context = state.status === 'loaded' ? state.context : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Plan</h1>
        <p className="text-sm text-muted mt-0.5">
          Model what happens when conditions change — or when you change the portfolio.
        </p>
      </div>

      {state.status === 'loading' && (
        <div className="grid grid-cols-2 gap-5">
          {CARDS.map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-muted py-8">Failed to load. Refresh to try again.</p>
      )}

      {state.status === 'loaded' && (
        <div className="grid grid-cols-2 gap-5">
          {CARDS.map(card => (
            <ScenarioCard key={card.href} card={card} context={context} />
          ))}
        </div>
      )}
    </div>
  )
}
