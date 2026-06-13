import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'
import { getPortfolioData, computePortfolioLVR } from '@/lib/aggregate'
import { PortfolioSummaryResponseSchema } from '@/lib/openapi/schemas'

export type { PortfolioLVR } from '@/lib/aggregate'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entityId')

    const { properties, valuations, balances, loans } = await getPortfolioData(user.id, entityId)
    const portfolio = computePortfolioLVR(properties, valuations, balances, loans)

    return NextResponse.json(PortfolioSummaryResponseSchema.parse({ portfolio }))
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/portfolio/summary' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
