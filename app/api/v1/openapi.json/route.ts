import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { generateOpenApiSpec } from '@/lib/openapi/spec'
import { captureError } from '@/lib/api-error'

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const spec = generateOpenApiSpec()
    return NextResponse.json(spec)
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/openapi.json' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
