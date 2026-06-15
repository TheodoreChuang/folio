import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { checkAllowance, consumeIfAllowed, DAILY_MESSAGE_CAP, streamChat } from '@/lib/assistant'

const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(2000),
    })
  ).min(1),
})

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.authMethod !== 'cookie') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { messages } = parsed.data

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

    const result = await streamChat(user.id, messages)
    return result.toUIMessageStreamResponse()
  } catch (err) {
    captureError(err, { route: 'POST /api/assistant/chat' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
