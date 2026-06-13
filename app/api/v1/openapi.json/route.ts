import { NextResponse } from 'next/server'
import { generateOpenApiSpec } from '@/lib/openapi/spec'
import { captureError } from '@/lib/api-error'

export async function GET() {
  try {
    return NextResponse.json(generateOpenApiSpec())
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/openapi.json' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
