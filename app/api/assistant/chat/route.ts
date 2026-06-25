import { NextResponse } from 'next/server'
import { convertToModelMessages, safeValidateUIMessages } from 'ai'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { logger } from '@/lib/logger'
import { consumeIfAllowed, DAILY_MESSAGE_CAP, streamChat } from '@/lib/assistant'

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.authMethod !== 'cookie') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null) as { messages?: unknown } | null
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      logger.debug('chat: missing or empty messages array')
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
    }

    const validated = await safeValidateUIMessages({ messages: body.messages })
    if (!validated.success) {
      logger.debug('chat: invalid messages format', { error: validated.error?.message })
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 })
    }

    const safeMessages = validated.data.filter(m => m.role !== 'system')
    if (safeMessages.length === 0) {
      logger.debug('chat: no non-system messages')
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
    }

    const MAX_MESSAGES = 50
    if (safeMessages.length > MAX_MESSAGES) {
      logger.debug('chat: too many messages', { count: safeMessages.length })
      return NextResponse.json({ error: `Request exceeds ${MAX_MESSAGES} message limit`, code: 'CHAT_CONVERSATION_TOO_LONG' }, { status: 400 })
    }

    const MAX_TEXT_CHARS = 2000
    for (const msg of safeMessages) {
      if (msg.role !== 'user') continue
      for (const part of msg.parts) {
        if (part.type === 'text' && part.text.length > MAX_TEXT_CHARS) {
          logger.debug('chat: user message text too long', { length: part.text.length })
          return NextResponse.json({ error: `Message exceeds ${MAX_TEXT_CHARS} character limit`, code: 'CHAT_MESSAGE_TOO_LONG' }, { status: 400 })
        }
      }
    }

    const modelMessages = await convertToModelMessages(safeMessages, { ignoreIncompleteToolCalls: true })

    const admission = await consumeIfAllowed(user.id)
    if (!admission.admitted) {
      return NextResponse.json(
        { error: 'Daily message limit reached', used: admission.used, limit: DAILY_MESSAGE_CAP },
        { status: 429 }
      )
    }

    const result = await streamChat(user.id, modelMessages)
    return result.toUIMessageStreamResponse()
  } catch (err) {
    captureError(err, { route: 'POST /api/assistant/chat' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
