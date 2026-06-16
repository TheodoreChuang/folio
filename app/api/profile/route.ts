import { z } from 'zod'
import { NextResponse } from 'next/server'
import { getProfile, upsertProfile } from '@/lib/profile'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const patchSchema = z.object({
  investmentGoal: z.string().max(200).optional(),
  strategyNotes: z.string().max(500).optional(),
})

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const profile = await getProfile(user.id)
    return NextResponse.json({
      profile: profile
        ? { investmentGoal: profile.investmentGoal, strategyNotes: profile.strategyNotes }
        : null,
    })
  } catch (err) {
    captureError(err, { route: 'GET /api/profile' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const profile = await upsertProfile(user.id, parsed.data)
    return NextResponse.json({
      profile: {
        investmentGoal: profile.investmentGoal,
        strategyNotes: profile.strategyNotes,
      },
    })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/profile' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
