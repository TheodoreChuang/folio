import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { fetchPlanContext } from '@/lib/aggregate/plan/context'

export async function GET(request?: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await fetchPlanContext(user.id)
    return NextResponse.json({ context })
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/plan/context' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
