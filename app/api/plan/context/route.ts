import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { fetchPlanContext } from '@/lib/aggregate/plan/context'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await fetchPlanContext(user.id)
    return NextResponse.json({ context })
  } catch (err) {
    captureError(err, { route: 'GET /api/plan/context' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
