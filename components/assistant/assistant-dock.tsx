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

const SK = { open: 'folio.agent.open', thread: 'folio.agent.thread' }

const TRANSPORT = new DefaultChatTransport({ api: '/api/assistant/chat' })

export function AssistantDock() {
  const pathname = usePathname()
  const { properties } = useSidebar()
  const hasData = properties.length > 0

  const [isOpen, setIsOpen] = useState(false)
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const [mounted, setMounted] = useState(false)
  const [input, setInput] = useState('')
  const [rateLimited, setRateLimited] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = sessionStorage.getItem(SK.thread)
      if (saved) setInitialMessages(JSON.parse(saved) as UIMessage[])
    } catch { /* ignore */ }
    try {
      setIsOpen(sessionStorage.getItem(SK.open) === 'true')
    } catch { /* ignore */ }
  }, [])

  const { messages, sendMessage, stop, status, error, setMessages } = useChat({
    transport: TRANSPORT,
    messages: initialMessages,
    onError: (err) => {
      if (err.message?.toLowerCase().includes('limit')) {
        setRateLimited(true)
      }
    },
  })

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

  if (!mounted) return null

  return (
    <>
      <style>{`
        @keyframes slideInDock {
          from { transform: translateX(calc(100% + 12px)); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Launcher button */}
      <button
        type="button"
        onClick={open}
        aria-label="Open AI assistant"
        style={{
          position: 'fixed',
          right: '22px',
          bottom: '22px',
          zIndex: 1200,
          height: '48px',
          paddingInline: '18px',
          borderRadius: 'var(--radius-pill)',
          background: 'hsl(var(--accent))',
          color: 'hsl(var(--accent-foreground))',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          boxShadow: '0 4px 16px hsl(var(--accent) / 0.3)',
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? 'none' : 'auto',
          transition: 'opacity 0.15s',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 1.5L11.09 6.26L16.5 7.27L12.75 10.93L13.68 16.5L9 13.87L4.32 16.5L5.25 10.93L1.5 7.27L6.91 6.26L9 1.5Z" fill="currentColor" />
        </svg>
        Ask Folio
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
          background: 'hsl(var(--surface-raised))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 12px))',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s',
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
            borderBottom: '1px solid hsl(var(--border))',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 1.5L11.09 6.26L16.5 7.27L12.75 10.93L13.68 16.5L9 13.87L4.32 16.5L5.25 10.93L1.5 7.27L6.91 6.26L9 1.5Z" fill="hsl(var(--accent))" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', fontFamily: 'var(--font-display)' }}>
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
                borderRadius: 'var(--radius-xs)',
                border: '1px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                color: 'hsl(var(--foreground) / 0.5)',
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
                borderRadius: 'var(--radius-xs)',
                border: '1px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                color: 'hsl(var(--foreground) / 0.5)',
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
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            <p
              style={{
                fontSize: '0.8125rem',
                color: 'hsl(var(--foreground) / 0.45)',
                marginBottom: '12px',
                margin: '0 0 12px',
              }}
            >
              Suggestions
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleStarterPrompt(prompt)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--background))',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: 'hsl(var(--foreground))',
                    lineHeight: 1.4,
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.background = 'hsl(var(--accent-soft))'
                    el.style.borderColor = 'hsl(var(--accent) / 0.3)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.background = 'hsl(var(--background))'
                    el.style.borderColor = 'hsl(var(--border))'
                  }}
                >
                  {prompt}
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
