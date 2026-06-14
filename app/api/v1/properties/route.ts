import { z } from 'zod'
import { NextResponse } from 'next/server'
import { listProperties, createProperty } from '@/lib/property'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { PropertiesListResponseSchema, PropertyCreatedResponseSchema } from '@/lib/openapi'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  address: z.string({ error: 'Missing or empty address' })
    .transform(s => s.trim())
    .refine(s => s.length > 0, 'Missing or empty address')
    .refine(s => s.length <= 500, 'Address too long (max 500 characters)'),
  nickname: z.string().nullable().optional(),
  startDate: z.string({ error: 'startDate is required' }).min(1, 'startDate is required'),
  endDate: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  propertyType: z.enum(['house', 'unit', 'townhouse', 'land'], { message: 'Invalid propertyType' }).nullable().optional(),
  purchasePriceCents: z.number().int().nonnegative().nullable().optional(),
})

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const entityIdParam = searchParams.get('entityId')
    if (entityIdParam !== null && !UUID_REGEX.test(entityIdParam)) {
      return NextResponse.json({ error: 'entityId must be a valid UUID' }, { status: 400 })
    }
    const entityId = entityIdParam ?? null

    const rows = await listProperties(user.id, entityId)
    return NextResponse.json(PropertiesListResponseSchema.parse({
      properties: rows.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
    }))
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/properties' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = postSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { address, nickname, startDate, endDate, entityId, propertyType, purchasePriceCents } = parsed.data

    if (endDate && endDate < startDate) {
      return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
    }

    const property = await createProperty({
      userId: user.id,
      address,
      nickname: nickname ?? null,
      startDate,
      endDate: endDate ?? null,
      entityId: entityId ?? null,
      propertyType: propertyType ?? null,
      purchasePriceCents: purchasePriceCents ?? null,
    })
    return NextResponse.json(
      PropertyCreatedResponseSchema.parse({ property: { ...property, createdAt: property.createdAt.toISOString() } }),
      { status: 201 }
    )
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/properties' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
