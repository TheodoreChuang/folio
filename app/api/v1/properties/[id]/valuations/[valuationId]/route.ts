import { NextResponse } from 'next/server'
import { deleteValuation } from '@/lib/property'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; valuationId: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, valuationId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(valuationId)) {
      return NextResponse.json({ error: 'Invalid valuation ID' }, { status: 400 })
    }

    const deleted = await deleteValuation(user.id, id, valuationId)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/properties/[id]/valuations/[valuationId]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
