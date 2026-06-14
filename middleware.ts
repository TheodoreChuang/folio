import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Per-instance in-memory rate limit — not shared across Vercel function instances.
// For distributed rate limiting, replace with Upstash Redis (@upstash/ratelimit).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 120

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    entry.count++
    if (entry.count > MAX_REQUESTS) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Retry after 60 seconds.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/v1/:path*',
}
