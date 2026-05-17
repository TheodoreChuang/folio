import * as React from 'react'
import { cn } from '@/lib/utils'

type PromptTone = 'action' | 'heads-up' | 'complete' | 'default'

const toneStyles: Record<PromptTone, string> = {
  action:   'before:bg-negative',
  'heads-up': 'before:bg-warning',
  complete: 'before:bg-positive',
  default:  'before:bg-muted',
}

const toneLabelStyles: Record<PromptTone, string> = {
  action:   'text-negative',
  'heads-up': 'text-warning',
  complete: 'text-positive',
  default:  'text-muted',
}

interface PromptProps {
  tone?: PromptTone
  severity?: string
  message: React.ReactNode
  context?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

function Prompt({ tone = 'default', severity, message, context, actions, className }: PromptProps) {
  return (
    <div
      className={cn(
        // left indicator bar via before pseudo-element
        'relative bg-surface border border-border rounded-[7px] p-6 overflow-hidden',
        'before:content-[""] before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        toneStyles[tone],
        className,
      )}
    >
      <div className={cn('grid gap-x-6', actions ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
        {/* Head row */}
        <div className="flex items-center gap-4 mb-4">
          {severity && (
            <span className={cn('flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-semibold', toneLabelStyles[tone])}>
              <span className={cn('w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold text-white', {
                'bg-negative': tone === 'action',
                'bg-warning': tone === 'heads-up',
                'bg-positive': tone === 'complete',
                'bg-muted': tone === 'default',
              })}>
                {tone === 'action' ? '!' : tone === 'complete' ? '✓' : '·'}
              </span>
              {severity}
            </span>
          )}
        </div>

        {/* Message */}
        <div className="font-serif text-xl leading-snug tracking-[-0.005em] text-ink text-pretty max-w-[60ch]">
          {message}
        </div>

        {/* Actions column */}
        {actions && (
          <div className="row-span-3 flex flex-col gap-3 min-w-[180px] self-center">
            {actions}
          </div>
        )}

        {/* Context */}
        {context && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted mt-4">
            {context}
          </div>
        )}
      </div>
    </div>
  )
}

export { Prompt }
export type { PromptTone, PromptProps }
