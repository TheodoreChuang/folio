import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/dashboard', '/upload', '/properties', '/reports']
const AUTH_ROUTES = ['/login', '/signup']

// Per-instance in-memory rate limit — not shared across Vercel function instances.
// For distributed rate limiting, replace with Upstash Redis (@upstash/ratelimit).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 120

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path.startsWith('/api/v1/')) {
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
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Check for a stale session cookie before getUser() might clear it
  const hadSessionCookie = request.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token') && c.value.length > 0
  )

  // Refresh session — required, do not remove
  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = PROTECTED_ROUTES.some(r => path.startsWith(r))
  const isAuthRoute = AUTH_ROUTES.some(r => path.startsWith(r))

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    if (hadSessionCookie) loginUrl.searchParams.set('reason', 'expired')
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
