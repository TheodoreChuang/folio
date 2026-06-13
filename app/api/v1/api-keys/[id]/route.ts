import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { revokeApiKey } from '@/lib/api-keys'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.authMethod === 'bearer') {
      return NextResponse.json({ error: 'API key management requires session authentication.' }, { status: 403 })
    }

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid API key ID' }, { status: 400 })
    }

    const revoked = await revokeApiKey(id, user.id)
    if (!revoked) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/api-keys/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
