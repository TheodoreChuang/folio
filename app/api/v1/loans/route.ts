import { z } from 'zod'
import { NextResponse } from 'next/server'
import { listAllLoansFlat, createInstallmentLoan } from '@/lib/borrowings'
import { findPropertyById } from '@/lib/property'
import { findEntityById } from '@/lib/entities'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import type { LoanType } from '@/db/schema'
import { LoansListResponseSchema } from '@/lib/openapi/schemas'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)

    const entityIdParam = searchParams.get('entityId')
    if (entityIdParam !== null && !UUID_REGEX.test(entityIdParam)) {
      return NextResponse.json({ error: 'entityId must be a valid UUID' }, { status: 400 })
    }

    const lenderParam = searchParams.get('lender')
    if (lenderParam !== null && lenderParam.length > 200) {
      return NextResponse.json({ error: 'lender too long (max 200 characters)' }, { status: 400 })
    }

    const loanTypeParam = searchParams.get('loanType')
    if (loanTypeParam !== null && !(LOAN_TYPES as readonly string[]).includes(loanTypeParam)) {
      return NextResponse.json({ error: 'loanType must be interest_only, principal_and_interest, or line_of_credit' }, { status: 400 })
    }

    const loans = await listAllLoansFlat(user.id, {
      entityId: entityIdParam,
      lender: lenderParam,
      loanType: loanTypeParam as LoanType | null,
    })
    return NextResponse.json(LoansListResponseSchema.parse({
      loans: loans.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    }))
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/loans' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const LOAN_TYPES = ['interest_only', 'principal_and_interest', 'line_of_credit'] as const

const schema = z.object({
  lender:              z.string({ error: 'lender is required' })
                         .transform(s => s.trim())
                         .refine(s => s.length > 0, 'lender is required')
                         .refine(s => s.length <= 200, 'lender too long (max 200 characters)'),
  nickname:            z.string().max(200).transform(s => s.trim() || null).nullable().optional(),
  accountReference:    z.string().max(100).transform(s => s.trim() || null).nullable().optional(),
  propertyId:          z.string().regex(UUID_REGEX, 'propertyId must be a valid UUID').nullable().optional(),
  entityId:            z.string().regex(UUID_REGEX, 'entityId must be a valid UUID').nullable().optional(),
  loanType:            z.enum(['interest_only', 'principal_and_interest', 'line_of_credit'],
                       'loanType must be interest_only, principal_and_interest, or line_of_credit').nullable().optional(),
  startDate:           z.string().regex(DATE_REGEX, 'startDate must be YYYY-MM-DD').nullable().optional(),
  endDate:             z.string().regex(DATE_REGEX, 'endDate must be YYYY-MM-DD').nullable().optional(),
  ioEndDate:           z.string().regex(DATE_REGEX, 'ioEndDate must be YYYY-MM-DD').nullable().optional(),
  interestRate:        z.number().min(0).max(100).nullable().optional(),
  rateType:            z.enum(['variable', 'fixed'],
                       'rateType must be variable or fixed').nullable().optional(),
  loanTermYears:       z.number().int().min(1).max(99).nullable().optional(),
  originalAmountCents: z.number().int().min(0).nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
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
    captureError(err, { route: 'POST /api/v1/loans' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
