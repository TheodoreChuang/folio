import { NextResponse } from 'next/server'
import {
  findInstallmentLoanById,
  listInstallmentLoanBalances,
  createInstallmentLoanBalance,
} from '@/lib/borrowings'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
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
    captureError(err, { route: 'GET /api/loans/[id]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}

    const recordedAt = typeof raw.recordedAt === 'string' ? raw.recordedAt.trim() : ''
    if (!DATE_REGEX.test(recordedAt)) {
      return NextResponse.json({ error: 'recordedAt must be YYYY-MM-DD' }, { status: 400 })
    }

    const balanceCents = raw.balanceCents
    if (typeof balanceCents !== 'number' || !Number.isInteger(balanceCents) || balanceCents < 0) {
      return NextResponse.json({ error: 'balanceCents must be a non-negative integer' }, { status: 400 })
    }

    const notes = raw.notes != null
      ? (typeof raw.notes === 'string' ? raw.notes.trim() || null : null)
      : null
    if (notes !== null && notes.length > 500) {
      return NextResponse.json({ error: 'notes too long (max 500 characters)' }, { status: 400 })
    }

    const loan = await findInstallmentLoanById(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const balance = await createInstallmentLoanBalance(user.id, id, {
      recordedAt,
      balanceCents,
      notes,
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
    captureError(err, { route: 'POST /api/loans/[id]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
