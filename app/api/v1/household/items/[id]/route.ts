import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateBudgetItem, softDeleteBudgetItem } from '@/lib/household'
import { toMonthlyCents, toAnnualCents } from '@/lib/household/compute'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  amountCents: z.number().int().positive().optional(),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'annual']).optional(),
  detail: z.string().max(200).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'at least one field required' }, { status: 400 })
    }

    const updated = await updateBudgetItem(user.id, id, parsed.data)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const item = {
      ...updated,
      monthlyCents: toMonthlyCents(updated.amountCents, updated.frequency),
      annualCents:  toAnnualCents(updated.amountCents, updated.frequency),
    }
    return NextResponse.json({ item })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/v1/household/items/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
    }

    const deleted = await softDeleteBudgetItem(user.id, id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/household/items/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
