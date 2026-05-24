import { NextResponse } from 'next/server'
import {
  findInstallmentLoanById,
  listLoanLedgerEntries,
  createLoanLedgerEntry,
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

    const repayments = await listLoanLedgerEntries(user.id, id)
    return NextResponse.json({ repayments })
  } catch (err) {
    captureError(err, { route: 'GET /api/loans/[id]/repayments' })
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

    const paymentDate = typeof raw.paymentDate === 'string' ? raw.paymentDate.trim() : ''
    if (!DATE_REGEX.test(paymentDate)) {
      return NextResponse.json({ error: 'paymentDate must be YYYY-MM-DD' }, { status: 400 })
    }

    const amountCents = raw.amountCents
    if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents must be a positive integer' }, { status: 400 })
    }

    if (raw.interestCents != null && !(typeof raw.interestCents === 'number' && Number.isInteger(raw.interestCents) && raw.interestCents >= 0)) {
      return NextResponse.json({ error: 'interestCents must be a non-negative integer or null' }, { status: 400 })
    }
    const interestCents = raw.interestCents != null ? (raw.interestCents as number) : null

    if (raw.principalCents != null && !(typeof raw.principalCents === 'number' && Number.isInteger(raw.principalCents) && raw.principalCents >= 0)) {
      return NextResponse.json({ error: 'principalCents must be a non-negative integer or null' }, { status: 400 })
    }
    const principalCents = raw.principalCents != null ? (raw.principalCents as number) : null

    const description = raw.description != null
      ? (typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) || null : null)
      : null

    const loan = await findInstallmentLoanById(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const repayment = await createLoanLedgerEntry(user.id, id, {
      paymentDate,
      amountCents,
      interestCents,
      principalCents,
      description,
    })
    return NextResponse.json({ repayment }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/loans/[id]/repayments' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
