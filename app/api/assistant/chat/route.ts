import { NextResponse } from 'next/server'
import { convertToModelMessages, safeValidateUIMessages } from 'ai'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { checkAllowance, consumeIfAllowed, DAILY_MESSAGE_CAP, streamChat } from '@/lib/assistant'

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.authMethod !== 'cookie') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null) as { messages?: unknown } | null
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
    }

    const validated = await safeValidateUIMessages({ messages: body.messages })
    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 })
    }

    const safeMessages = validated.data.filter(m => m.role !== 'system')
    if (safeMessages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
    }

    const MAX_TEXT_CHARS = 2000
    for (const msg of safeMessages) {
      for (const part of msg.parts) {
        if (part.type === 'text' && part.text.length > MAX_TEXT_CHARS) {
          return NextResponse.json({ error: `Message exceeds ${MAX_TEXT_CHARS} character limit` }, { status: 400 })
        }
      }
    }

    const allowance = await checkAllowance(user.id)
    if (!allowance.allowed) {
      return NextResponse.json(
        { error: 'Daily message limit reached', used: allowance.used, limit: DAILY_MESSAGE_CAP },
        { status: 429 }
      )
    }

    const admission = await consumeIfAllowed(user.id)
    if (!admission.admitted) {
      return NextResponse.json(
        { error: 'Daily message limit reached', used: admission.used, limit: DAILY_MESSAGE_CAP },
        { status: 429 }
      )
    }

    const modelMessages = await convertToModelMessages(safeMessages, { ignoreIncompleteToolCalls: true })
    const result = await streamChat(user.id, modelMessages)
    return result.toUIMessageStreamResponse()
  } catch (err) {
    captureError(err, { route: 'POST /api/assistant/chat' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
