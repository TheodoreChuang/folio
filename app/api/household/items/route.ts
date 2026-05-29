import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listBudgetItems, createBudgetItem } from '@/lib/household'
import { toMonthlyCents, computeSummary } from '@/lib/household/compute'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const postSchema = z.object({
  type: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'type must be "income" or "expense"' }) }),
  name: z.string({ required_error: 'name is required' }).trim().min(1, 'name is required').max(200),
  amountCents: z.number().int().positive('amountCents must be a positive integer'),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'annual']),
  effectiveFrom: z.string().optional(),
})

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const items = await listBudgetItems(user.id)
    const enrichedItems = items.map(item => ({
      ...item,
      monthlyCents: toMonthlyCents(item.amountCents, item.frequency),
    }))
    const summary = computeSummary(items)

    return NextResponse.json({ items: enrichedItems, summary })
  } catch (err) {
    captureError(err, { route: 'GET /api/household/items' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const created = await createBudgetItem({ userId: user.id, ...parsed.data })
    const item = { ...created, monthlyCents: toMonthlyCents(created.amountCents, created.frequency) }

    return NextResponse.json({ item }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/household/items' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
