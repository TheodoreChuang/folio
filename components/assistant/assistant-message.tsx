'use client'

import type { UIMessage, ToolUIPart, DynamicToolUIPart } from 'ai'
import { isToolOrDynamicToolUIPart, getToolOrDynamicToolName } from 'ai'
import type { ChecklistStepResult } from '@/lib/assistant/catalog'

const TOOL_LABELS: Record<string, string> = {
  getPortfolioSummary: 'Reading portfolio summary…',
  getPropertyDetail: 'Looking up property details…',
  getLoanDetail: 'Querying your loans…',
  getCashflowByPeriod: 'Fetching cashflow data…',
  lookupLedgerEntries: 'Searching ledger entries…',
}

type ToolOutput = {
  statusLabel?: string
  source?: string
  label?: string
}

function isToolOutput(value: unknown): value is ToolOutput {
  return typeof value === 'object' && value !== null
}

function ToolStatusRow({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const toolName = getToolOrDynamicToolName(part)
  const isComplete = part.state === 'output-available' || part.state === 'output-error'

  let label: string
  if (part.state === 'output-available' && isToolOutput(part.output) && part.output.statusLabel) {
    label = part.output.statusLabel
  } else {
    label = TOOL_LABELS[toolName] ?? `Running ${toolName}…`
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--muted-foreground)', padding: '4px 0' }}
    >
      {isComplete ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="7" fill="rgba(55, 101, 108, 0.15)" />
          <path d="M4 7l2 2 4-4" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid rgba(55, 101, 108, 0.3)',
            borderTopColor: 'var(--color-accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </div>
  )
}

function CitationChips({ parts }: { parts: UIMessage['parts'] }) {
  const completedTools = parts.filter(
    (p): p is ToolUIPart | DynamicToolUIPart =>
      isToolOrDynamicToolUIPart(p) && p.state === 'output-available' && isToolOutput(p.output) && Boolean((p.output as ToolOutput).source)
  )
  if (completedTools.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
      {completedTools.map((part, i) => {
        const output = part.output as ToolOutput
        return (
          <a
            key={part.toolCallId}
            href={output.source}
            title={output.label ?? output.source}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.6875rem',
              fontWeight: 600,
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: '10px',
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              cursor: 'pointer',
              userSelect: 'none',
              textDecoration: 'none',
            }}
          >
            [{i + 1}]
          </a>
        )
      })}
    </div>
  )
}

function isChecklistStepResult(value: unknown): value is ChecklistStepResult {
  if (typeof value !== 'object' || value === null) return false
  const step = value as Record<string, unknown>
  return typeof step.order === 'number' && typeof step.label === 'string' && typeof step.href === 'string'
}

function getChecklistSteps(part: ToolUIPart | DynamicToolUIPart): ChecklistStepResult[] {
  if (part.state !== 'output-available') return []
  if (getToolOrDynamicToolName(part) !== 'buildActionChecklist') return []
  const output = part.output
  if (typeof output !== 'object' || output === null || !('steps' in output)) return []
  const steps = (output as { steps?: unknown }).steps
  return Array.isArray(steps) ? steps.filter(isChecklistStepResult) : []
}

function ActionChecklist({ parts }: { parts: UIMessage['parts'] }) {
  const steps = parts
    .filter(isToolOrDynamicToolUIPart)
    .flatMap(getChecklistSteps)
    .slice()
    .sort((a, b) => a.order - b.order)
  if (steps.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
      {steps.map(step => (
        <a
          key={`${step.order}-${step.href}`}
          href={step.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            border: '1px solid rgba(55, 101, 108, 0.24)',
            borderRadius: '8px',
            background: 'var(--background)',
            color: 'var(--foreground)',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              fontSize: '0.6875rem',
              fontWeight: 600,
            }}
          >
            {step.order}
          </span>
          <span>{step.label}</span>
        </a>
      ))}
    </div>
  )
}

function resolveErrorMessage(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { code?: string }
    if (body?.code === 'CHAT_CONVERSATION_TOO_LONG') return 'Conversation is too long. Start a new chat.'
    if (body?.code === 'CHAT_MESSAGE_TOO_LONG') return 'Your message is too long (2,000 character max).'
  } catch { /* network error or non-JSON body */ }
  return 'Something went wrong. Try again.'
}

interface AssistantMessageProps {
  message: UIMessage
  isLast: boolean
  error?: Error
  status: string
}

export function AssistantMessage({ message, isLast, error, status }: AssistantMessageProps) {
  if (message.role === 'user') {
    const textPart = message.parts.find(p => p.type === 'text')
    const text = textPart?.type === 'text' ? textPart.text : ''
    const showError = isLast && status === 'error' && error
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showError ? '4px' : '12px' }}>
          <div
            style={{
              background: 'rgba(229, 239, 240, 0.7)',
              border: '1px solid rgba(55, 101, 108, 0.16)',
              color: 'var(--foreground)',
              borderRadius: '14px 14px 4px 14px',
              padding: '8px 14px',
              maxWidth: '85%',
              fontSize: '0.875rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {text}
          </div>
        </div>
        {showError && (
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 12px',
              background: 'rgba(169, 74, 45, 0.1)',
              border: '1px solid rgba(169, 74, 45, 0.3)',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              color: 'var(--color-negative)',
            }}
          >
            {resolveErrorMessage(error)}
          </div>
        )}
      </>
    )
  }

  const hasText = message.parts.some(p => p.type === 'text' && p.text.length > 0)
  const isStreaming = isLast && status === 'streaming'

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ maxWidth: '100%', fontSize: '0.875rem', lineHeight: 1.6 }}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <p
                key={i}
                style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--foreground)' }}
              >
                {part.text}
                {isStreaming && i === message.parts.length - 1 && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '1em',
                      background: 'var(--color-accent)',
                      marginLeft: '2px',
                      verticalAlign: 'text-bottom',
                      animation: 'blink 1s step-end infinite',
                    }}
                    aria-hidden="true"
                  />
                )}
              </p>
            )
          }

          if (isToolOrDynamicToolUIPart(part)) {
            return <ToolStatusRow key={i} part={part} />
          }

          return null
        })}

        {isLast && !hasText && status === 'submitted' && (
          <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
            {[0, 1, 2].map(n => (
              <span
                key={n}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'rgba(34, 31, 28, 0.3)',
                  display: 'inline-block',
                  animation: `bounce 1.2s ease-in-out ${n * 0.2}s infinite`,
                }}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        <ActionChecklist parts={message.parts} />
        <CitationChips parts={message.parts} />
      </div>

      {isLast && status === 'error' && error && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            background: 'rgba(169, 74, 45, 0.1)',
            border: '1px solid rgba(169, 74, 45, 0.3)',
            borderRadius: '8px',
            fontSize: '0.8125rem',
            color: 'var(--color-negative)',
          }}
        >
          {resolveErrorMessage(error)}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
