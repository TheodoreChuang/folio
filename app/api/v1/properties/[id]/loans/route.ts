import { z } from 'zod'
import { NextResponse } from 'next/server'
import { findPropertyById } from '@/lib/property'
import { listInstallmentLoans, createInstallmentLoan } from '@/lib/borrowings'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  lender: z.string({ error: 'lender is required' })
    .transform(s => s.trim())
    .refine(s => s.length > 0, 'lender is required')
    .refine(s => s.length <= 200, 'lender too long (max 200 characters)'),
  nickname: z.string().nullable().optional(),
  startDate: z.string({ error: 'startDate is required' }).min(1, 'startDate is required'),
  endDate: z.string({ error: 'endDate is required' }).min(1, 'endDate is required'),
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

    const loans = await listInstallmentLoans(user.id, id)
    return NextResponse.json({ loans })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/properties/[id]/loans' })
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
    const { lender, nickname, startDate, endDate } = parsed.data

    if (endDate < startDate) {
      return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
    }

    const property = await findPropertyById(user.id, id)
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const loan = await createInstallmentLoan(user.id, { propertyId: id, lender, nickname: nickname ?? null, startDate, endDate })
    return NextResponse.json({ loan }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/properties/[id]/loans' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
