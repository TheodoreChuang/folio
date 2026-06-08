import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { entities, properties, installmentLoans } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const patchSchema = z.object({
  name: z.string({ required_error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200)'),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid entity ID' }, { status: 400 })

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { name } = parsed.data

    const [updated] = await db
      .update(entities)
      .set({ name })
      .where(and(eq(entities.id, id), eq(entities.userId, user.id)))
      .returning()

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ entity: updated })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/entities/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid entity ID' }, { status: 400 })

    const [propCount, loanCount] = await Promise.all([
      db.select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.userId, user.id), eq(properties.entityId, id)))
        .limit(1),
      db.select({ id: installmentLoans.id })
        .from(installmentLoans)
        .where(and(eq(installmentLoans.userId, user.id), eq(installmentLoans.entityId, id)))
        .limit(1),
    ])

    if (propCount.length || loanCount.length) {
      return NextResponse.json(
        { error: 'Reassign or remove all properties and loans before deleting this entity.' },
        { status: 409 }
      )
    }

    const [deleted] = await db
      .delete(entities)
      .where(and(eq(entities.id, id), eq(entities.userId, user.id)))
      .returning()

    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/entities/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
