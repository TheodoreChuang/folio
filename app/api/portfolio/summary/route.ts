import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { fetchPortfolioData, computePortfolioLVR } from '@/lib/reporting'

export type { PortfolioLVR } from '@/lib/reporting'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entityId')

    const { properties, valuations, balances, loans } = await fetchPortfolioData(user.id, entityId)
    const portfolio = computePortfolioLVR(properties, valuations, balances, loans)

    return NextResponse.json({ portfolio })
  } catch (err) {
    captureError(err, { route: 'GET /api/portfolio/summary' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
