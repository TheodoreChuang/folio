import { z } from 'zod'
import { NextResponse } from 'next/server'
import { listEntities, createEntity } from '@/lib/entities'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const ENTITY_TYPES = ['individual', 'joint', 'trust', 'company', 'superannuation'] as const

const postSchema = z.object({
  name: z.string({ required_error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200)'),
  type: z.enum(ENTITY_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${ENTITY_TYPES.join(', ')}` }),
  }),
})

export async function GET(request?: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rows = await listEntities(user.id)
    return NextResponse.json({ entities: rows })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/entities' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { name, type } = parsed.data

    const entity = await createEntity(user.id, name, type)
    return NextResponse.json({ entity }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/entities' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
