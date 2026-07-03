import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { findLedgerEntryById, deleteLedgerEntry, correctLedgerEntry } from '@/lib/aggregate'

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

const patchSchema = z
  .object({
    category: z.enum(LEDGER_CATEGORIES).optional(),
    amountCents: z.number().int().positive('amountCents must be a positive integer').optional(),
    lineItemDate: z.string().regex(DATE_REGEX, 'lineItemDate must be YYYY-MM-DD').optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) => v.category !== undefined || v.amountCents !== undefined || v.lineItemDate !== undefined || v.description !== undefined,
    { message: 'At least one field must be provided' },
  )

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const entry = await correctLedgerEntry(user.id, id, parsed.data)
    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ entry })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/v1/ledger/[id]' })
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
      // Return 404 to avoid leaking whether the entry exists
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const entry = await findLedgerEntryById(user.id, id)
    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Source-document-linked entries are deletable here (R10) — the prior 403 guard is
    // removed. The delete records deletionReason='user_deleted' so a later re-upload of
    // the source statement can warn that this row was previously removed (R18).
    await deleteLedgerEntry(user.id, id)

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/ledger/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
