import { z } from 'zod'
import { NextResponse } from 'next/server'
import {
  findInstallmentLoanById,
  listInstallmentLoanBalances,
  createInstallmentLoanBalance,
} from '@/lib/borrowings'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  recordedAt: z.string({ required_error: 'recordedAt is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'recordedAt must be YYYY-MM-DD'),
  balanceCents: z.number({ required_error: 'balanceCents is required', invalid_type_error: 'balanceCents must be a non-negative integer' })
    .int('balanceCents must be a non-negative integer')
    .nonnegative('balanceCents must be a non-negative integer'),
  notes: z.string().max(500, 'notes too long (max 500 characters)').nullable().optional()
    .transform(v => v == null ? null : v.trim() || null),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    const loan = await findInstallmentLoanById(user.id, loanId)
    if (!loan || loan.propertyId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const balances = await listInstallmentLoanBalances(user.id, loanId)
    return NextResponse.json({ balances })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties/[id]/loans/[loanId]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { recordedAt, balanceCents, notes } = parsed.data

    const loan = await findInstallmentLoanById(user.id, loanId)
    if (!loan || loan.propertyId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const balance = await createInstallmentLoanBalance(user.id, loanId, {
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
      (err as { code: string }).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'A balance for this date already exists' },
        { status: 409 }
      )
    }
    captureError(err, { route: 'POST /api/properties/[id]/loans/[loanId]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
