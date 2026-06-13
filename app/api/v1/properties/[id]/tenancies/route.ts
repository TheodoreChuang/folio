import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findPropertyById, listTenancies, addTenancy } from '@/lib/property'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  leaseType: z.enum(['fixed_term', 'periodic']),
  leaseStart: z.string().min(1, 'leaseStart is required'),
  weeklyRentCents: z.number().int().positive('weeklyRentCents must be a positive integer'),
  leaseEnd: z.string().nullable().optional(),
  tenants: z.string().nullable().optional(),
  bondCents: z.number().int().nonnegative('bondCents must be a non-negative integer').nullable().optional(),
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

    const tenancies = await listTenancies(user.id, id)
    return NextResponse.json({ tenancies })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/properties/[id]/tenancies' })
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
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    try {
      const tenancy = await addTenancy(user.id, id, parsed.data)
      return NextResponse.json({ tenancy }, { status: 201 })
    } catch (err) {
      if (err instanceof Error && err.message === 'Property not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw err
    }
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/properties/[id]/tenancies' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
