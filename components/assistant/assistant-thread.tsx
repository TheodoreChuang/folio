'use client'

import { useEffect, useRef } from 'react'
import type { UIMessage } from 'ai'
import { AssistantMessage } from './assistant-message'

interface AssistantThreadProps {
  messages: UIMessage[]
  status: string
  error?: Error
}

export function AssistantThread({ messages, status, error }: AssistantThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) return null

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map((message, i) => (
        <AssistantMessage
          key={message.id}
          message={message}
          isLast={i === messages.length - 1}
          status={status}
          error={error}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
