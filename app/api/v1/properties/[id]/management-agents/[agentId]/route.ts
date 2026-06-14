import { NextResponse } from 'next/server'
import { removeManagementAgent } from '@/lib/property'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, agentId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID' }, { status: 400 })
    }

    const deleted = await removeManagementAgent(user.id, id, agentId)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/properties/[id]/management-agents/[agentId]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
