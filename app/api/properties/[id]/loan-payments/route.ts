import { z } from 'zod'
import { NextResponse } from 'next/server'
import { validateLoanOwnership } from '@/lib/borrowings'
import { upsertLoanPaymentEntry } from '@/lib/property'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  loanAccountId: z.string({ required_error: 'loanAccountId must be a valid UUID' }).uuid('loanAccountId must be a valid UUID'),
  amountCents: z.number({ required_error: 'amountCents is required', invalid_type_error: 'amountCents must be a positive integer' })
    .int('amountCents must be a positive integer')
    .positive('amountCents must be a positive integer'),
  lineItemDate: z.string({ required_error: 'lineItemDate must be YYYY-MM-DD' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'lineItemDate must be YYYY-MM-DD'),
})

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

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { loanAccountId, amountCents, lineItemDate } = parsed.data

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
