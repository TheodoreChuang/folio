import { z } from 'zod'
import { NextResponse } from 'next/server'
import { listAllLoansFlat, createInstallmentLoan } from '@/lib/borrowings'
import { findPropertyById } from '@/lib/property'
import { findEntityById } from '@/lib/entities'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const loans = await listAllLoansFlat(user.id)
    return NextResponse.json({ loans })
  } catch (err) {
    captureError(err, { route: 'GET /api/loans' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  lender:              z.string({ required_error: 'lender is required' })
                         .transform(s => s.trim())
                         .refine(s => s.length > 0, 'lender is required')
                         .refine(s => s.length <= 200, 'lender too long (max 200 characters)'),
  nickname:            z.string().max(200).transform(s => s.trim() || null).nullable().optional(),
  accountReference:    z.string().max(100).transform(s => s.trim() || null).nullable().optional(),
  propertyId:          z.string().regex(UUID_REGEX, 'propertyId must be a valid UUID').nullable().optional(),
  entityId:            z.string().regex(UUID_REGEX, 'entityId must be a valid UUID').nullable().optional(),
  loanType:            z.enum(['interest_only', 'principal_and_interest', 'line_of_credit'], {
                         errorMap: () => ({ message: 'loanType must be interest_only, principal_and_interest, or line_of_credit' }),
                       }).nullable().optional(),
  startDate:           z.string().regex(DATE_REGEX, 'startDate must be YYYY-MM-DD').nullable().optional(),
  endDate:             z.string().regex(DATE_REGEX, 'endDate must be YYYY-MM-DD').nullable().optional(),
  ioEndDate:           z.string().regex(DATE_REGEX, 'ioEndDate must be YYYY-MM-DD').nullable().optional(),
  interestRate:        z.number().min(0).max(100).nullable().optional(),
  rateType:            z.enum(['variable', 'fixed'], {
                         errorMap: () => ({ message: 'rateType must be variable or fixed' }),
                       }).nullable().optional(),
  loanTermYears:       z.number().int().min(1).max(99).nullable().optional(),
  originalAmountCents: z.number().int().min(0).nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const {
      lender, nickname, accountReference, propertyId, entityId,
      loanType, startDate, endDate, ioEndDate, interestRate,
      rateType, loanTermYears, originalAmountCents,
    } = parsed.data

    if (propertyId) {
      const property = await findPropertyById(user.id, propertyId)
      if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (entityId) {
      const ent = await findEntityById(user.id, entityId)
      if (!ent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const loan = await createInstallmentLoan(user.id, {
      lender,
      nickname: nickname ?? null,
      accountReference: accountReference ?? null,
      propertyId: propertyId ?? null,
      entityId: entityId ?? null,
      loanType: loanType ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      ioEndDate: ioEndDate ?? null,
      interestRate: interestRate != null ? String(interestRate) : null,
      rateType: rateType ?? null,
      loanTermYears: loanTermYears ?? null,
      originalAmountCents: originalAmountCents ?? null,
    })

    return NextResponse.json({ loan }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/loans' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
