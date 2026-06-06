'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type EntityType = 'individual' | 'joint' | 'trust' | 'company' | 'superannuation'

export interface FilterOption {
  id: string
  name: string
  subLabel?: string
  meta?: string
  count: number
  entityType?: EntityType
  disabled?: boolean
}

interface FilterChipProps {
  label: string
  labelPlural?: string
  itemLabel?: string
  value: string | null
  options: FilterOption[]
  onChange: (id: string | null) => void
  variant?: 'rich' | 'simple'
  actionLink?: { href: string; label: string }
  align?: 'start' | 'end'
}

function EntityGlyph({ type }: { type: EntityType }) {
  switch (type) {
    case 'trust':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="2" y="4" width="10" height="8" rx="0.5"/>
          <path d="M5 4V2.5h4V4"/>
          <path d="M2 8h10"/>
        </svg>
      )
    case 'individual':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="7" cy="5.2" r="2.2"/>
          <path d="M2.5 12c.7-2.3 2.4-3.4 4.5-3.4S10.8 9.7 11.5 12"/>
        </svg>
      )
    case 'company':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="2.5" y="3" width="9" height="9"/>
          <path d="M2.5 6h9M5 12V6M9 12V6"/>
        </svg>
      )
    case 'joint':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="5" cy="5" r="2"/>
          <circle cx="9" cy="5" r="2"/>
          <path d="M1 12c.5-2 2-3 4-3M13 12c-.5-2-2-3-4-3M5 9c.6-.2 1.3-.3 2-.3s1.4.1 2 .3"/>
        </svg>
      )
    case 'superannuation':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M7 2L2.5 4.5v3C2.5 10.5 4.5 12.5 7 13c2.5-.5 4.5-2.5 4.5-5.5v-3L7 2z"/>
        </svg>
      )
  }
}

function AllGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5"/>
    </svg>
  )
}

export function FilterChip({
  label,
  labelPlural,
  itemLabel,
  value,
  options,
  onChange,
  variant = 'simple',
  actionLink,
  align = 'start',
}: FilterChipProps) {
  const allLabel = labelPlural ?? `${label.toLowerCase()}s`
  const noItemLabel = itemLabel ?? allLabel
  const [open, setOpen] = useState(false)
  const selectedOption = options.find(o => o.id === value) ?? null
  const totalCount = options.reduce((sum, o) => sum + o.count, 0)
  const isActive = value !== null

  function handleSelect(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 h-[30px] pl-3 pr-2.5 rounded-[7px] border text-sm whitespace-nowrap transition-colors cursor-pointer',
            isActive
              ? 'bg-accent-soft border-accent/20 text-accent'
              : 'bg-surface border-border text-foreground hover:border-foreground-subtle/50',
          )}
        >
          <span className={cn('text-xs mr-0.5', isActive ? 'text-accent/70' : 'text-foreground-subtle')}>
            {label}
          </span>
          {selectedOption ? selectedOption.name : `All ${allLabel}`}
          {isActive ? (
            <span
              role="button"
              aria-label={`Clear ${label.toLowerCase()} filter`}
              onClick={e => { e.stopPropagation(); onChange(null) }}
              className="inline-flex items-center justify-center p-0.5 -mr-0.5 opacity-70 hover:opacity-100 hover:bg-accent/12 rounded-[3px] cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.4"/>
                <line x1="2" y1="8" x2="8" y2="2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </span>
          ) : (
            <span className="inline-block w-2 h-2 border-r border-b border-foreground-subtle rotate-45 mb-0.5 ml-1" aria-hidden />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-80 p-2 rounded-[7px] border border-border bg-surface-raised shadow-md"
      >
        <div className="px-4 py-3 pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-subtle">
          Filter by {label.toLowerCase()}
        </div>

        {/* All option */}
        <button
          type="button"
          role="option"
          aria-selected={!isActive}
          onClick={() => handleSelect(null)}
          className={cn(
            'w-full text-left rounded-[5px] px-4 py-3 text-sm transition-colors',
            !isActive
              ? 'bg-accent-soft text-accent'
              : 'text-foreground hover:bg-surface-sunken',
          )}
          style={
            variant === 'rich'
              ? { display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: '0.75rem', alignItems: 'center' }
              : { display: 'flex', alignItems: 'center', gap: '0.75rem' }
          }
        >
          {variant === 'rich' && (
            <span className={cn('flex items-center justify-center w-4 h-4', !isActive ? 'text-accent' : 'text-foreground-subtle')}>
              <AllGlyph />
            </span>
          )}
          <span className="flex-1 flex flex-col leading-tight">
            All {allLabel}
          </span>
          <span className={cn('text-xs tabular-nums', !isActive ? 'text-accent' : 'text-foreground-subtle')}>
            {totalCount}
          </span>
        </button>

        <div className="h-px bg-rule mx-1.5 my-1" />

        {/* Options */}
        {options.map(option => {
          const isSelected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={option.disabled}
              onClick={() => !option.disabled && handleSelect(option.id)}
              className={cn(
                'w-full text-left rounded-[5px] px-4 py-3 text-sm transition-colors',
                isSelected
                  ? 'bg-accent-soft text-accent hover:bg-accent-soft'
                  : option.disabled
                    ? 'text-foreground-muted pointer-events-none opacity-60'
                    : 'text-foreground hover:bg-surface-sunken',
              )}
              style={{ display: 'grid', gridTemplateColumns: variant === 'rich' ? '18px 1fr auto' : '1fr auto', gap: '0.75rem', alignItems: 'center' }}
            >
              {variant === 'rich' && (
                <span className={cn('flex items-center justify-center w-4 h-4', isSelected ? 'text-accent' : 'text-foreground-subtle')}>
                  {option.entityType ? <EntityGlyph type={option.entityType} /> : <AllGlyph />}
                </span>
              )}
              <span className="flex flex-col leading-tight">
                <span>{option.name}</span>
                {option.subLabel && (
                  <span className={cn('text-[10px] mt-0.5 font-normal', isSelected ? 'text-accent/70' : 'text-foreground-subtle')}>
                    {option.subLabel}
                  </span>
                )}
              </span>
              <span className={cn('text-xs tabular-nums', isSelected ? 'text-accent' : 'text-foreground-subtle')}>
                {option.disabled ? `No ${noItemLabel}` : (option.meta ?? (option.count > 0 ? option.count : null))}
              </span>
            </button>
          )
        })}

        {actionLink && (
          <>
            <div className="h-px bg-rule mx-1.5 my-1" />
            <Link
              href={actionLink.href}
              onClick={() => setOpen(false)}
              className="w-full text-left rounded-[5px] px-4 py-3 text-sm text-foreground-muted hover:bg-surface-sunken transition-colors"
              style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: '0.75rem', alignItems: 'center' }}
            >
              <span className="flex items-center justify-center w-4 h-4 text-foreground-subtle">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M7 3v8M3 7h8"/>
                </svg>
              </span>
              <span className="flex flex-col leading-tight">{actionLink.label}</span>
              <span className="text-xs text-foreground-subtle">↗</span>
            </Link>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
