import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findPropertyById, listManagementAgents, addManagementAgent } from '@/lib/property'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const postSchema = z.object({
  agencyName: z.string({ required_error: 'agencyName is required' }).min(1, 'agencyName is required'),
  statementCadence: z.enum(['weekly', 'fortnightly', 'monthly', 'bi_monthly'], {
    errorMap: () => ({ message: 'statementCadence must be one of: weekly, fortnightly, monthly, bi_monthly' }),
  }),
  effectiveFrom: z.string({ required_error: 'effectiveFrom is required' }).min(1, 'effectiveFrom is required'),
  contactName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  feePercent: z.union([z.string(), z.number()]).nullable().optional().transform(v =>
    v === null || v === undefined ? null : String(v)
  ),
  effectiveTo: z.string().nullable().optional(),
})

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
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const property = await findPropertyById(user.id, id)
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const agents = await listManagementAgents(user.id, id)
    return NextResponse.json({ agents })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties/[id]/management-agents' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const agent = await addManagementAgent(user.id, id, parsed.data)
    return NextResponse.json({ agent }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'Property not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    captureError(err, { route: 'POST /api/properties/[id]/management-agents' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
