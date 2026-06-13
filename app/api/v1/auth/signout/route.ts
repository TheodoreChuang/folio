import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (user?.authMethod === 'bearer') {
      return NextResponse.json(
        { error: 'Bearer tokens cannot be invalidated via this endpoint. Revoke the key at DELETE /api/v1/api-keys/{id}.' },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/auth/signout' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
