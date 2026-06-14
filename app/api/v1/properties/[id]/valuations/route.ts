import { z } from 'zod'
import { NextResponse } from 'next/server'
import { findPropertyById, listValuations, createValuation } from '@/lib/property'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  valuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'valuedAt must be YYYY-MM-DD'),
  valueCents: z.number({ error: 'valueCents must be a positive integer' })
    .int('valueCents must be a positive integer')
    .positive('valueCents must be a positive integer'),
  source: z.string().max(200, 'source too long (max 200 characters)').nullable().optional()
    .transform(v => v == null ? null : v.trim() || null),
  notes: z.string().max(500, 'notes too long (max 500 characters)').nullable().optional()
    .transform(v => v == null ? null : v.trim() || null),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const property = await findPropertyById(user.id, id)
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const valuations = await listValuations(user.id, id)
    return NextResponse.json({ valuations })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/properties/[id]/valuations' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { valuedAt, valueCents, source, notes } = parsed.data

    const property = await findPropertyById(user.id, id)
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const valuation = await createValuation({
      userId: user.id,
      propertyId: id,
      valuedAt,
      valueCents,
      source: source ?? null,
      notes: notes ?? null,
    })

    return NextResponse.json({ valuation }, { status: 201 })
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'A valuation for this date already exists' },
        { status: 409 }
      )
    }
    captureError(err, { route: 'POST /api/v1/properties/[id]/valuations' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
