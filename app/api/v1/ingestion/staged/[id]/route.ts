import { z } from 'zod'
import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { patchStagedItem, deleteStagedItem, countStagedByDocument, dismissPendingDocument } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const LEDGER_CATEGORIES = [
  'rent',
  'insurance',
  'rates',
  'repairs',
  'property_management',
  'utilities',
  'strata_fees',
  'other_expense',
  'loan_payment',
  'other_income',
] as const

const patchSchema = z.object({
  propertyId: z.string().regex(UUID_REGEX).nullable().optional(),
  category: z.enum(LEDGER_CATEGORIES).optional(),
  description: z.string().min(1).max(500).optional(),
  amountCents: z.number().int().positive('amountCents must be a positive integer').optional(),
  lineItemDate: z.string().regex(DATE_REGEX, 'lineItemDate must be YYYY-MM-DD').optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const item = await patchStagedItem(id, user.id, parsed.data)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ item })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/v1/ingestion/staged/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// R7 "remove from import" — deletes a single staged item. If it was the last item on its
// document, the document is auto-dismissed (mirrors the U5 commit-time empty case).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const removed = await deleteStagedItem(id, user.id)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let dismissed = false
    const remaining = await countStagedByDocument(user.id, removed.sourceDocumentId)
    if (remaining === 0) {
      await dismissPendingDocument(user.id, removed.sourceDocumentId)
      dismissed = true
    }

    return NextResponse.json({ success: true, dismissed })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/ingestion/staged/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
