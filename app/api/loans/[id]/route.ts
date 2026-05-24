import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { findInstallmentLoanDetail, updateInstallmentLoanById } from '@/lib/borrowings'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { db } from '@/lib/db'
import { entities } from '@/db/schema'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    const loan = await findInstallmentLoanDetail(user.id, id)
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ loan })
  } catch (err) {
    captureError(err, { route: 'GET /api/loans/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}

    const updates: {
      lender?: string
      nickname?: string | null
      startDate?: string
      endDate?: string
      entityId?: string | null
      loanType?: 'interest_only' | 'principal_and_interest' | null
      ioEndDate?: string | null
      interestRate?: string | null
    } = {}

    if ('lender' in raw) {
      const lender = typeof raw.lender === 'string' ? raw.lender.trim() : ''
      if (!lender) {
        return NextResponse.json({ error: 'lender cannot be empty' }, { status: 400 })
      }
      if (lender.length > 200) {
        return NextResponse.json({ error: 'lender too long (max 200 characters)' }, { status: 400 })
      }
      updates.lender = lender
    }

    if ('nickname' in raw) {
      updates.nickname = typeof raw.nickname === 'string' ? raw.nickname.trim() || null : null
    }

    if ('startDate' in raw) {
      const startDate = typeof raw.startDate === 'string' ? raw.startDate.trim() : ''
      if (!DATE_REGEX.test(startDate)) {
        return NextResponse.json({ error: 'startDate must be YYYY-MM-DD' }, { status: 400 })
      }
      updates.startDate = startDate
    }

    if ('endDate' in raw) {
      const endDate = typeof raw.endDate === 'string' ? raw.endDate.trim() : ''
      if (!DATE_REGEX.test(endDate)) {
        return NextResponse.json({ error: 'endDate must be YYYY-MM-DD' }, { status: 400 })
      }
      updates.endDate = endDate
    }

    if ('entityId' in raw) {
      const entityId = typeof raw.entityId === 'string' && UUID_REGEX.test(raw.entityId) ? raw.entityId : null
      if (entityId) {
        const [ent] = await db
          .select({ id: entities.id })
          .from(entities)
          .where(and(eq(entities.id, entityId), eq(entities.userId, user.id)))
          .limit(1)
        if (!ent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      updates.entityId = entityId
    }

    if ('loanType' in raw) {
      if (raw.loanType === null) {
        updates.loanType = null
      } else if (raw.loanType === 'interest_only' || raw.loanType === 'principal_and_interest') {
        updates.loanType = raw.loanType
      } else {
        return NextResponse.json(
          { error: 'loanType must be interest_only, principal_and_interest, or null' },
          { status: 400 }
        )
      }
    }

    if ('ioEndDate' in raw) {
      if (raw.ioEndDate === null) {
        updates.ioEndDate = null
      } else {
        const ioEndDate = typeof raw.ioEndDate === 'string' ? raw.ioEndDate.trim() : ''
        if (!DATE_REGEX.test(ioEndDate)) {
          return NextResponse.json({ error: 'ioEndDate must be YYYY-MM-DD' }, { status: 400 })
        }
        updates.ioEndDate = ioEndDate
      }
    }

    if ('interestRate' in raw) {
      if (raw.interestRate === null) {
        updates.interestRate = null
      } else if (typeof raw.interestRate === 'number' && isFinite(raw.interestRate) && raw.interestRate >= 0 && raw.interestRate <= 100) {
        updates.interestRate = String(raw.interestRate)
      } else {
        return NextResponse.json(
          { error: 'interestRate must be a non-negative number or null' },
          { status: 400 }
        )
      }
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
    captureError(err, { route: 'PATCH /api/loans/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
