import { randomBytes, createHash } from 'crypto'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { resolveUser } from '@/lib/api-auth'
import { listApiKeys, createApiKey, countActiveApiKeys } from '@/lib/api-keys'
import { captureError } from '@/lib/api-error'
import { ApiKeysListResponseSchema, ApiKeyCreatedResponseSchema } from '@/lib/openapi/schemas'

const postSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(100, 'name too long (max 100 characters)'),
})

export async function GET(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.authMethod === 'bearer') {
      return NextResponse.json({ error: 'API key management requires session authentication.' }, { status: 403 })
    }

    const keys = await listApiKeys(user.id)
    return NextResponse.json(ApiKeysListResponseSchema.parse({
      apiKeys: keys.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
    }))
  } catch (err) {
    captureError(err, { route: 'GET /api/v1/api-keys' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.authMethod === 'bearer') {
      return NextResponse.json({ error: 'API key management requires session authentication.' }, { status: 403 })
    }

    const parsed = postSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name } = parsed.data

    const keyCount = await countActiveApiKeys(user.id)
    if (keyCount >= 10) {
      return NextResponse.json({ error: 'Key limit reached (max 10 active keys per user)' }, { status: 400 })
    }

    const rawToken = `sk_live_${randomBytes(24).toString('base64url')}`
    const keyHash = createHash('sha256').update(rawToken).digest('hex')
    const keyPrefix = rawToken.slice(0, 14) // "sk_live_" + 6 chars

    const apiKey = await createApiKey(user.id, name, keyHash, keyPrefix)

    return NextResponse.json(ApiKeyCreatedResponseSchema.parse({
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawToken,
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt.toISOString(),
      },
    }), { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/api-keys' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
