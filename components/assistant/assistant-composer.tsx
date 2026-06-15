'use client'

import { useRef, type KeyboardEvent } from 'react'

const MAX_CHARS = 2000
const WARN_CHARS = 1900

interface AssistantComposerProps {
  input: string
  onInputChange: (value: string) => void
  sendMessage: (opts: { text: string }) => void
  stop: () => void
  status: string
  rateLimited?: boolean
}

export function AssistantComposer({
  input,
  onInputChange,
  sendMessage,
  stop,
  status,
  rateLimited = false,
}: AssistantComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isActive = status === 'submitted' || status === 'streaming'
  const isDisabled = isActive || rateLimited
  const charCount = input.length
  const charOverWarn = charCount > WARN_CHARS

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isDisabled && input.trim().length > 0) {
        handleSend()
      }
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text) return
    sendMessage({ text })
    onInputChange('')
  }

  if (rateLimited) {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid hsl(var(--border))',
          background: 'hsl(var(--surface-sunken))',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            color: 'hsl(var(--foreground) / 0.5)',
            textAlign: 'center',
          }}
        >
          Daily limit reached. Check back tomorrow.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        borderTop: '1px solid hsl(var(--border))',
        padding: '12px 16px',
        background: 'hsl(var(--surface-raised))',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius-sm)',
          background: 'hsl(var(--background))',
          overflow: 'hidden',
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          maxLength={MAX_CHARS}
          placeholder="Ask anything about your portfolio…"
          rows={3}
          style={{
            resize: 'none',
            border: 'none',
            outline: 'none',
            padding: '10px 12px',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            background: 'transparent',
            color: 'hsl(var(--foreground))',
            fontFamily: 'var(--font-sans)',
            width: '100%',
            boxSizing: 'border-box',
            opacity: isDisabled ? 0.6 : 1,
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px 8px',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: charOverWarn ? 'hsl(var(--negative))' : 'hsl(var(--foreground) / 0.4)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {charCount} / {MAX_CHARS}
          </span>

          {isActive ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generation"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--surface))',
                cursor: 'pointer',
                color: 'hsl(var(--foreground))',
                flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={input.trim().length === 0}
              aria-label="Send message"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: input.trim().length === 0 ? 'hsl(var(--accent) / 0.3)' : 'hsl(var(--accent))',
                cursor: input.trim().length === 0 ? 'default' : 'pointer',
                color: 'hsl(var(--accent-foreground))',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
