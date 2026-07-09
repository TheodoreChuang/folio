import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { entities } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Auto-create default individual entity (idempotent)
      const existing = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.userId, user.id), eq(entities.type, 'individual')))
        .limit(1)
      if (!existing.length) {
        await db.insert(entities).values({ userId: user.id, name: 'Personal', type: 'individual' })
      }
    }
  }

  return NextResponse.redirect(new URL('/dashboard', origin))
}
