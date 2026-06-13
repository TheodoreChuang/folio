import { z } from 'zod'
import { NextResponse } from 'next/server'
import {
  findInstallmentLoanById,
  listLoanLedgerEntries,
  createLoanLedgerEntry,
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

    const repayments = await listLoanLedgerEntries(user.id, id)
    return NextResponse.json({ repayments })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/loans/[id]/repayments' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const repaymentSchema = z.object({
  paymentDate:    z.string().regex(DATE_REGEX, 'paymentDate must be YYYY-MM-DD'),
  amountCents:    z.number({ invalid_type_error: 'amountCents must be a positive integer' })
                   .int('amountCents must be a positive integer')
                   .positive('amountCents must be a positive integer'),
  interestCents:  z.number({ invalid_type_error: 'interestCents must be a non-negative integer or null' })
                   .int('interestCents must be a non-negative integer or null')
                   .min(0, 'interestCents must be a non-negative integer or null')
                   .nullable().optional(),
  principalCents: z.number({ invalid_type_error: 'principalCents must be a non-negative integer or null' })
                   .int('principalCents must be a non-negative integer or null')
                   .min(0, 'principalCents must be a non-negative integer or null')
                   .nullable().optional(),
  description:    z.string().max(500).transform(s => s.trim() || null).nullable().optional(),
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

    const parsed = repaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { paymentDate, amountCents, interestCents, principalCents, description } = parsed.data

    const loan = await findInstallmentLoanById(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const repayment = await createLoanLedgerEntry(user.id, id, {
      paymentDate,
      amountCents,
      interestCents: interestCents ?? null,
      principalCents: principalCents ?? null,
      description: description ?? null,
    })
    return NextResponse.json({ repayment }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/loans/[id]/repayments' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
