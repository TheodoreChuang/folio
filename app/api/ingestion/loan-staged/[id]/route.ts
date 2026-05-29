import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { patchLoanStagedItem } from '@/lib/ingestion'
import { findInstallmentLoanById } from '@/lib/borrowings'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const patchSchema = z.object({
  installmentLoanId: z.string().regex(UUID_REGEX, 'installmentLoanId must be a valid UUID').nullable().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  interestCents: z.number().int().nonnegative().nullable().optional(),
  principalCents: z.number().int().nonnegative().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    if (parsed.data.installmentLoanId) {
      const loan = await findInstallmentLoanById(user.id, parsed.data.installmentLoanId)
      if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 400 })
    }

    const item = await patchLoanStagedItem(id, user.id, parsed.data)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ item })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/ingestion/loan-staged/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
