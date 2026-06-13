import { z } from 'zod'
import { NextResponse } from 'next/server'
import { findInstallmentLoanDetail, updateInstallmentLoanById } from '@/lib/borrowings'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { findEntityById } from '@/lib/entities'

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

    const loan = await findInstallmentLoanDetail(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ loan })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/loans/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
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

    const rawResult = z.record(z.unknown()).safeParse(body)
    const raw = rawResult.success ? rawResult.data : {}

    const updates: {
      lender?: string
      nickname?: string | null
      accountReference?: string | null
      startDate?: string
      endDate?: string
      entityId?: string | null
      loanType?: 'interest_only' | 'principal_and_interest' | null
      ioEndDate?: string | null
      interestRate?: string | null
    } = {}

    if ('lender' in raw) {
      const r = z.string()
        .transform(s => s.trim())
        .refine(s => s.length > 0, 'lender cannot be empty')
        .refine(s => s.length <= 200, 'lender too long (max 200 characters)')
        .safeParse(raw.lender)
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      updates.lender = r.data
    }

    if ('nickname' in raw) {
      const r = z.string().max(200).transform(s => s.trim() || null).nullable()
        .safeParse(typeof raw.nickname === 'string' ? raw.nickname : null)
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      updates.nickname = r.data
    }

    if ('accountReference' in raw) {
      const r = z.string().max(100, 'accountReference too long (max 100 characters)').transform(s => s.trim() || null).nullable()
        .safeParse(typeof raw.accountReference === 'string' ? raw.accountReference : null)
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      updates.accountReference = r.data
    }

    if ('startDate' in raw) {
      const r = z.string().regex(DATE_REGEX, 'startDate must be YYYY-MM-DD')
        .safeParse(typeof raw.startDate === 'string' ? raw.startDate.trim() : '')
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      updates.startDate = r.data
    }

    if ('endDate' in raw) {
      const r = z.string().regex(DATE_REGEX, 'endDate must be YYYY-MM-DD')
        .safeParse(typeof raw.endDate === 'string' ? raw.endDate.trim() : '')
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      updates.endDate = r.data
    }

    if ('entityId' in raw) {
      const r = z.string().regex(UUID_REGEX, 'entityId must be a valid UUID').nullable()
        .safeParse(raw.entityId === null ? null : raw.entityId)
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      if (r.data) {
        const ent = await findEntityById(user.id, r.data)
        if (!ent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      updates.entityId = r.data
    }

    if ('loanType' in raw) {
      const r = z.enum(['interest_only', 'principal_and_interest']).nullable()
        .safeParse(raw.loanType)
      if (!r.success) return NextResponse.json({ error: 'loanType must be interest_only, principal_and_interest, or null' }, { status: 400 })
      updates.loanType = r.data
    }

    if ('ioEndDate' in raw) {
      const r = z.string().regex(DATE_REGEX, 'ioEndDate must be YYYY-MM-DD').nullable()
        .safeParse(typeof raw.ioEndDate === 'string' ? raw.ioEndDate.trim() : raw.ioEndDate === null ? null : '')
      if (!r.success) return NextResponse.json({ error: r.error.errors[0].message }, { status: 400 })
      updates.ioEndDate = r.data
    }

    if ('interestRate' in raw) {
      const r = z.number().min(0).max(100).nullable()
        .safeParse(raw.interestRate)
      if (!r.success) return NextResponse.json({ error: 'interestRate must be a non-negative number or null' }, { status: 400 })
      updates.interestRate = r.data !== null ? String(r.data) : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
      return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
    }

    if (updates.loanType === 'principal_and_interest' && 'ioEndDate' in updates && updates.ioEndDate !== null) {
      return NextResponse.json({ error: 'ioEndDate cannot be set for principal_and_interest loans' }, { status: 400 })
    }

    const updated = await updateInstallmentLoanById(user.id, id, updates)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ loan: updated })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/v1/loans/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
