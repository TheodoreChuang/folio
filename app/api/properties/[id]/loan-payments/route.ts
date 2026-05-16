import { NextResponse } from 'next/server'
import { validateLoanOwnership } from '@/lib/borrowings'
import { upsertLoanPaymentEntry } from '@/lib/property'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

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
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

    const loanAccountId = typeof raw.loanAccountId === 'string' ? raw.loanAccountId.trim() : ''
    if (!UUID_REGEX.test(loanAccountId)) {
      return NextResponse.json({ error: 'loanAccountId must be a valid UUID' }, { status: 400 })
    }

    const amountCents = raw.amountCents
    if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents must be a positive integer' }, { status: 400 })
    }

    const lineItemDate = typeof raw.lineItemDate === 'string' ? raw.lineItemDate.trim() : ''
    if (!DATE_REGEX.test(lineItemDate)) {
      return NextResponse.json({ error: 'lineItemDate must be YYYY-MM-DD' }, { status: 400 })
    }

    const loan = await validateLoanOwnership(user.id, id, loanAccountId)
    if (!loan) {
      return NextResponse.json({ error: 'Loan account not found' }, { status: 404 })
    }

    const month = lineItemDate.slice(0, 7)
    const description = `${loan.lender}${loan.nickname ? ` — ${loan.nickname}` : ''} repayment ${month}`

    const entry = await upsertLoanPaymentEntry(
      user.id,
      id,
      loanAccountId,
      lineItemDate,
      amountCents,
      description,
    )

    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/properties/[id]/loan-payments' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
