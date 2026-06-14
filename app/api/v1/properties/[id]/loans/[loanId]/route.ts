import { z } from 'zod'
import { NextResponse } from 'next/server'
import { updateInstallmentLoan, endInstallmentLoan } from '@/lib/borrowings'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LOAN_TYPES = ['interest_only', 'principal_and_interest'] as const

const patchBodySchema = z.object({
  lender: z.string()
    .transform(s => s.trim())
    .refine(s => s.length > 0, 'lender cannot be empty')
    .refine(s => s.length <= 200, 'lender too long (max 200 characters)')
    .optional(),
  nickname: z.string().nullable().optional(),
  startDate: z.string().min(1, 'startDate cannot be empty').optional(),
  endDate: z.string().min(1, 'endDate cannot be empty').optional(),
  entityId: z.string().nullable().optional(),
  loanType: z.enum(LOAN_TYPES).nullable().optional(),
  ioEndDate: z.string().nullable().optional(),
  interestRate: z.number().nonnegative('interestRate must be a non-negative number or null')
    .transform(v => String(v)).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId } = await params
    if (!UUID_REGEX.test(id) || !UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const parsed = patchBodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const updates = parsed.data

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
      return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
    }

    const updated = await updateInstallmentLoan(user.id, id, loanId, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ loan: updated })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/v1/properties/[id]/loans/[loanId]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId } = await params
    if (!UUID_REGEX.test(id) || !UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const updated = await endInstallmentLoan(user.id, id, loanId)
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/properties/[id]/loans/[loanId]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
