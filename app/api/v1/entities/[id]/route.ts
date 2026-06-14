import { z } from 'zod'
import { NextResponse } from 'next/server'
import { updateEntity, deleteEntity } from '@/lib/entities'
import { hasPropertyForEntity } from '@/lib/property'
import { hasLoanForEntity } from '@/lib/borrowings'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const patchSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200)'),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid entity ID' }, { status: 400 })

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name } = parsed.data

    const entity = await updateEntity(user.id, id, name)
    if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ entity })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/v1/entities/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid entity ID' }, { status: 400 })

    const [hasProp, hasLoan] = await Promise.all([
      hasPropertyForEntity(user.id, id),
      hasLoanForEntity(user.id, id),
    ])

    if (hasProp || hasLoan) {
      return NextResponse.json(
        { error: 'Reassign or remove all properties and loans before deleting this entity.' },
        { status: 409 }
      )
    }

    const entity = await deleteEntity(user.id, id)
    if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/entities/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
