import { z } from 'zod'
import { NextResponse } from 'next/server'
import {
  findInstallmentLoanById,
  listInstallmentLoanBalances,
  createInstallmentLoanBalance,
} from '@/lib/borrowings'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    const loan = await findInstallmentLoanById(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const balances = await listInstallmentLoanBalances(user.id, id)
    return NextResponse.json({ balances })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/loans/[id]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const balanceSchema = z.object({
  recordedAt:   z.string().regex(DATE_REGEX, 'recordedAt must be YYYY-MM-DD'),
  balanceCents: z.number({ error: 'balanceCents must be a non-negative integer' })
                 .int('balanceCents must be a non-negative integer')
                 .min(0, 'balanceCents must be a non-negative integer'),
  notes:        z.string().max(500, 'notes too long (max 500 characters)').transform(s => s.trim() || null).nullable().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = balanceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { recordedAt, balanceCents, notes } = parsed.data

    const loan = await findInstallmentLoanById(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const balance = await createInstallmentLoanBalance(user.id, id, {
      recordedAt,
      balanceCents,
      notes: notes ?? null,
    })
    return NextResponse.json({ balance }, { status: 201 })
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as Record<string, unknown>).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'A balance for this date already exists' },
        { status: 409 }
      )
    }
    captureError(err, { route: 'POST /api/v1/loans/[id]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
