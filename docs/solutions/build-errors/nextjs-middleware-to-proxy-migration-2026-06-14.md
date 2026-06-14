---
title: "Next.js 16: middleware.ts and proxy.ts cannot coexist"
date: 2026-06-14
category: build-errors
module: routing
problem_type: build_error
component: tooling
symptoms:
  - "Build fails with: Both middleware file \"./middleware.ts\" and proxy file \"./proxy.ts\" are detected. Please use \"./proxy.ts\" only."
  - CI passes locally but fails after a Next.js upgrade
root_cause: config_error
resolution_type: code_fix
severity: high
tags:
  - nextjs
  - middleware
  - proxy
  - next16
  - upgrade
---

# Next.js 16: middleware.ts and proxy.ts cannot coexist

## Problem

Next.js 16 replaced `middleware.ts` with `proxy.ts` as the request-interception
layer. Having both files present in the project root causes a hard build error.
This typically surfaces after upgrading Next.js when the old `middleware.ts` was
not removed.

## Symptoms

```
Error: Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are
detected. Please use "./proxy.ts" only.
```

## What Didn't Work

Renaming or moving `middleware.ts` is not the fix — Next.js looks for the exact
filename. Keeping both files under any name combination is not supported.

## Solution

1. Merge all logic from `middleware.ts` into `proxy.ts`
2. Delete `middleware.ts`

If `middleware.ts` handled a different concern than `proxy.ts` (e.g., rate
limiting on API routes vs. cookie-based auth redirects for pages), guard the
logic by path inside the single `proxy` function:

```typescript
// proxy.ts
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Rate limiting — previously in middleware.ts
  if (path.startsWith('/api/v1/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    // ... rate limit logic ...
    if (rateLimitExceeded) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Retry after 60 seconds.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
  }

  // Auth session refresh + redirect logic — already in proxy.ts
  let supabaseResponse = NextResponse.next({ request })
  // ...
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

The `config.matcher` in `proxy.ts` should be broad enough to cover all paths
that either concern needs. Use the one from `proxy.ts` as the base and verify
it includes the API path pattern.

## Why This Works

Next.js 16 consolidated middleware behaviour into `proxy.ts`. The framework
detects both files at build time and fails fast rather than running both with
undefined precedence. A single `proxy` function with path-guarded branches
replicates the same separation of concerns without the conflict.

## Prevention

- After any Next.js major version upgrade, check for a `middleware.ts` →
  `proxy.ts` rename in the migration guide before running the build.
- Keep both files in `.gitignore` as a CI signal? No — the fix is deletion,
  not ignoring. A pre-commit hook that fails if both files exist would catch
  it before push:
  ```bash
  if [ -f middleware.ts ] && [ -f proxy.ts ]; then
    echo "Error: both middleware.ts and proxy.ts exist. Merge them into proxy.ts."
    exit 1
  fi
  ```

## Related Issues

- [Next.js docs: middleware-to-proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
