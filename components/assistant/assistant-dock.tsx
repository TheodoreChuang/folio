'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useSidebar } from '@/components/sidebar-context'
import { AssistantThread } from './assistant-thread'
import { AssistantComposer } from './assistant-composer'
import { getStarterPrompts } from './starter-prompts'

const SK = {
  open: 'folio.agent.open',
  thread: 'folio.agent.thread',
  firstRunTriggered: 'folio.agent.firstRunTriggered',
  setupSignature: 'folio.agent.setupSignature',
}

const TRANSPORT = new DefaultChatTransport({ api: '/api/assistant/chat' })

const FIXED_FIRST_RUN_PROMPT = 'Help me finish setting up my portfolio.'

function computeSetupSignature(entityCount: number, propertyCount: number, loanCount: number): string {
  return `${entityCount}:${propertyCount}:${loanCount}`
}

const FA_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

// Sparkle SVG paths shared between FAB and header mark
const SparkIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>
    <path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2z" fill="currentColor" stroke="none"/>
  </svg>
)

export function AssistantDock() {
  const pathname = usePathname()
  const { properties, loans, entities, loaded } = useSidebar()
  const hasData = properties.length > 0
  // Every authenticated user has an auto-created "Personal" entity from their first
  // auth callback (app/auth/callback/route.ts) — entities.length is never 0 in practice,
  // so "needs setup" is defined by zero properties/loans, matching that same route's own
  // redirect condition.
  const isEmptyPortfolio = loaded && properties.length === 0 && loans.length === 0

  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [input, setInput] = useState('')
  const [rateLimited, setRateLimited] = useState(false)

  const { messages, sendMessage, stop, status, error, setMessages } = useChat({
    transport: TRANSPORT,
    onError: (err) => {
      try {
        const body = JSON.parse(err.message) as { error?: string }
        if (body?.error === 'Daily message limit reached') setRateLimited(true)
      } catch { /* non-JSON error body */ }
    },
  })

  useEffect(() => {
    setMounted(true)
    try {
      const saved = sessionStorage.getItem(SK.thread)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setMessages(parsed as UIMessage[])
      }
    } catch { /* ignore */ }
    try {
      setIsOpen(sessionStorage.getItem(SK.open) === 'true')
    } catch { /* ignore */ }
  }, [setMessages])

  // First-run: proactively open and send the setup prompt for a genuinely empty portfolio,
  // once per browser session. Gated on `loaded` (not just mounted) since properties/loans/entities
  // all start as [] before their fetch resolves — an ungated check would misfire for existing
  // users on every fresh session.
  useEffect(() => {
    if (!mounted || !isEmptyPortfolio) return
    try {
      if (sessionStorage.getItem(SK.firstRunTriggered) === 'true') return
      sessionStorage.setItem(SK.firstRunTriggered, 'true')
      sessionStorage.setItem(SK.setupSignature, computeSetupSignature(entities.length, properties.length, loans.length))
    } catch { /* ignore */ }
    setIsOpen(true)
    try { sessionStorage.setItem(SK.open, 'true') } catch { /* ignore */ }
    sendMessage({ text: FIXED_FIRST_RUN_PROMPT })
  }, [mounted, isEmptyPortfolio, entities.length, properties.length, loans.length, sendMessage])

  // Re-prompt with the next resolvable step once the setup-chain state changes (e.g. the user
  // created an entity on /entities and came back). Driven by the portfolio signature, not by the
  // dock's open/close state — the FAB is inert while the dock is open, and action chips are plain
  // <a> links that either full-reload the page or leave the dock exactly as it was, so nothing
  // else would ever re-trigger this. Only fires for sessions where the first-run flow already
  // started, so returning users asking one-off questions never get an unsolicited nudge.
  //
  // Fires at most once, on the transition into having a first property: that's the flow's
  // "complete enough" point — the assistant's own reply already describes the remaining steps
  // (upload statements, add a loan, assign a PM) in prose, and further portfolio edits by an
  // established user (this app targets 2-10 properties) must never re-trigger an unsolicited
  // "finish setting up" nudge. The flag is cleared right after firing so later property/loan
  // changes don't retrigger it.
  useEffect(() => {
    if (!mounted || !loaded || status !== 'ready') return
    try {
      if (sessionStorage.getItem(SK.firstRunTriggered) !== 'true') return
      const signature = computeSetupSignature(entities.length, properties.length, loans.length)
      const lastSignature = sessionStorage.getItem(SK.setupSignature)
      if (lastSignature === null || signature === lastSignature) return
      sessionStorage.setItem(SK.setupSignature, signature)
      if (properties.length > 0) {
        sessionStorage.removeItem(SK.firstRunTriggered)
        sessionStorage.removeItem(SK.setupSignature)
      }
      setIsOpen(true)
      sessionStorage.setItem(SK.open, 'true')
      sendMessage({ text: FIXED_FIRST_RUN_PROMPT })
    } catch { /* ignore */ }
  }, [mounted, loaded, status, entities.length, properties.length, loans.length, sendMessage])

  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem(SK.thread, JSON.stringify(messages))
      } catch { /* ignore */ }
    }
  }, [messages])

  const open = useCallback(() => {
    setIsOpen(true)
    try { sessionStorage.setItem(SK.open, 'true') } catch { /* ignore */ }
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    try { sessionStorage.setItem(SK.open, 'false') } catch { /* ignore */ }
  }, [])

  const handleReset = useCallback(() => {
    setMessages([])
    setRateLimited(false)
    try { sessionStorage.removeItem(SK.thread) } catch { /* ignore */ }
  }, [setMessages])

  const prompts = getStarterPrompts(pathname, hasData)

  const handleStarterPrompt = useCallback((prompt: string) => {
    sendMessage({ text: prompt })
  }, [sendMessage])

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        if (!isOpen) open()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, open])

  if (!mounted) return null

  return (
    <>
      <style>{`
        .fa-fab-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: 0;
          margin-left: 0;
          opacity: 0;
          overflow: hidden;
          white-space: nowrap;
          font-size: 0.9375rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: max-width 240ms ${FA_EASE}, opacity 160ms ease, margin-left 240ms ${FA_EASE};
        }
        .fa-fab:hover .fa-fab-label,
        .fa-fab:focus-visible .fa-fab-label {
          max-width: 160px;
          margin-left: 8px;
          opacity: 1;
        }
        .fa-fab:hover { transform: translateY(-1px); }
        .fa-fab:active { transform: translateY(0); }
      `}</style>

      {/* Floating launcher — icon-only at rest, expands on hover */}
      <button
        type="button"
        className="fa-fab"
        onClick={open}
        aria-label="Open AI assistant"
        style={{
          position: 'fixed',
          right: '22px',
          bottom: '22px',
          zIndex: 1200,
          height: '48px',
          paddingInline: '14px',
          borderRadius: '9999px',
          background: 'var(--color-accent)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(30, 23, 18, 0.10), 0 8px 24px rgba(36, 70, 75, 0.22)',
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? 'none' : 'auto',
          transition: `transform 160ms ${FA_EASE}, opacity 140ms ease`,
        }}
      >
        <SparkIcon size={19} />
        <span className="fa-fab-label">
          Ask Folio
          <kbd style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '18px',
            padding: '0 5px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.16)',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'rgba(255, 255, 255, 0.85)',
          }}>⌘K</kbd>
        </span>
      </button>

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: '12px',
          right: '12px',
          bottom: '12px',
          zIndex: 1210,
          width: '412px',
          maxWidth: 'calc(100vw - 24px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--popover)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          boxShadow: '0 1px 2px rgba(30, 23, 18, 0.06), 0 18px 50px rgba(30, 23, 18, 0.18)',
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
          opacity: isOpen ? 1 : 0,
          transition: `transform 320ms ${FA_EASE}, opacity 220ms ease`,
          pointerEvents: isOpen ? 'auto' : 'none',
          overflow: 'hidden',
        }}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-rule)',
            background: 'var(--card)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            {/* Mark badge — accent-soft bg, accent-color icon */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              flexShrink: 0,
            }}>
              <SparkIcon size={15} />
            </span>
            <span style={{ fontWeight: 500, fontSize: '1rem', fontFamily: 'var(--font-display)', letterSpacing: '0.005em' }}>
              Ask Folio
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={handleReset}
              aria-label="New chat"
              title="New chat"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '5px',
                border: '1px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M1.5 7.5a6 6 0 1 0 .75-3M1.5 1.5v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close assistant"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '5px',
                border: '1px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Thread */}
        {messages.length > 0 ? (
          <AssistantThread messages={messages} status={status} error={error} />
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 20px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            {/* Greeting */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '1.375rem',
                lineHeight: 1.3,
                letterSpacing: '0.005em',
                color: 'var(--foreground)',
                margin: '0 0 6px',
              }}>
                Your portfolio,{' '}
                <em style={{ fontStyle: 'italic', color: 'var(--color-accent)' }}>at a glance.</em>
              </p>
              <p style={{
                fontSize: '0.8125rem',
                color: 'var(--muted-foreground)',
                lineHeight: 1.5,
                margin: 0,
              }}>
                Ask about cashflow, valuations, or any detail across your properties.
              </p>
            </div>

            {/* Suggestion chips */}
            <p style={{
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--muted-foreground)',
              margin: '0 0 10px',
            }}>
              Suggestions
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleStarterPrompt(prompt)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--card)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    color: 'var(--foreground)',
                    lineHeight: 1.4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'border-color 120ms ease, background-color 120ms ease',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.borderColor = 'rgba(55, 101, 108, 0.45)'
                    el.style.background = 'rgba(229, 239, 240, 0.4)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.borderColor = 'var(--color-border)'
                    el.style.background = 'var(--card)'
                  }}
                >
                  <span style={{ flex: 1 }}>{prompt}</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ color: 'var(--color-foreground-faint)', flexShrink: 0 }}>
                    <path d="M3 6h6M6.5 3.5L9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <AssistantComposer
          input={input}
          onInputChange={setInput}
          sendMessage={sendMessage}
          stop={stop}
          status={status}
          rateLimited={rateLimited}
        />
      </div>
    </>
  )
}
