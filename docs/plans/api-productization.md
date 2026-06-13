# API Productization

**Issue:** #81  
**Branch:** `claude/api-productization-brainstorm-t7iz32`

Promotes Folio's API to a first-class product surface for all consumers — the internal Next.js browser app, external programmatic callers, and AI tools (Custom GPT, Claude MCP).

---

## What was built

### Phase 1 — API versioning

All 40 routes hard-cut from `app/api/` to `app/api/v1/`. No redirect shim (no production users on the old paths). All internal `fetch('/api/...')` calls, test static imports, and one dashboard type import updated simultaneously.

Convention fix: `extract` route was returning 422 for scanned PDFs — changed to 400.

### Phase 2 — API key infrastructure

New `api_keys` table (`db/schema.ts`, `drizzle/0026_api_keys.sql`):

```
id          uuid PK
user_id     uuid (RLS: auth.uid() = user_id)
name        text
key_hash    text UNIQUE     -- SHA-256 of the full key
key_prefix  text            -- first 14 chars, for display
last_used_at  timestamptz
created_at    timestamptz DEFAULT now()
revoked_at    timestamptz   -- null = active
```

Domain module at `lib/api-keys/`: `findApiKeyByHash`, `listApiKeys`, `createApiKey`, `revokeApiKey`, `touchLastUsed`.

Key format: `sk_live_{32-char-base64url}` generated via `crypto.randomBytes(24)`. Full key shown once at creation; only prefix shown thereafter.

### Phase 3 — Shared auth resolver

`lib/api-auth.ts` — `resolveUser(request?)`:

1. `Authorization: Bearer sk_live_...` header → SHA-256 hash → lookup `api_keys` → `touchLastUsed` (fire-and-forget) → return `{ id: userId, authMethod: 'bearer' }`
2. No header → `createServerSupabaseClient().auth.getUser()` (existing cookie path)
3. Both fail → return `null` → route returns 401

All route handlers replaced their 3-line Supabase auth boilerplate with a single `resolveUser(request)` call. Cookie auth unchanged for the browser app.

### Phase 4 — API key routes

```
GET    /api/v1/api-keys        list active keys (id, name, keyPrefix, lastUsedAt, createdAt)
POST   /api/v1/api-keys        create key; returns full key once at 201
DELETE /api/v1/api-keys/[id]   revoke key
```

14 unit tests: 401 (unauthenticated), 400 (validation), 404 (not found / wrong user), 200/201 happy paths, userId scoping verification.

### Phase 5 — OpenAPI spec

`lib/openapi/spec.ts` uses `@asteasolutions/zod-to-openapi` to generate an OpenAPI 3.1.0 document. Security scheme: `BearerAuth`. Covers: Properties, Loans, Entities, Portfolio summary/return, Ledger, Reports trends, API Keys.

`GET /api/v1/openapi.json` — auth-gated endpoint that serves the spec.

Spec-first process documented in `docs/conventions.md §10`: new routes require a spec entry before implementation.

### Phase 6 — Settings UI

`app/(app)/settings/api-keys/page.tsx`:
- Lists active keys with name, prefix, created date, last used date
- Create dialog: name input → POST → one-time key display with copy button
- Revoke: confirm dialog → DELETE

Settings index page updated with a **Developer** section card linking to `/settings/api-keys`.

---

## Key files

| File | Purpose |
|------|---------|
| `lib/api-auth.ts` | Shared auth resolver (bearer + cookie) |
| `lib/api-keys/` | API key domain (repo + index) |
| `app/api/v1/api-keys/` | Key management API routes |
| `app/api/v1/openapi.json/route.ts` | Spec endpoint |
| `lib/openapi/spec.ts` | OpenAPI 3.1 spec generator |
| `app/(app)/settings/api-keys/page.tsx` | Settings UI |
| `db/schema.ts` | `apiKeys` table added |
| `drizzle/0026_api_keys.sql` | Migration + RLS policy |
| `docs/conventions.md §10` | Spec-first process |

---

## Verification

```bash
# Auth smoke tests
curl /api/v1/properties                                           # → 401
curl -H "Authorization: Bearer sk_live_..." /api/v1/properties   # → 200
# in browser (cookie auth still works)                            # → 200

# Old paths gone
curl /api/properties  # → 404

# Spec
curl -H "Authorization: Bearer sk_live_..." /api/v1/openapi.json  # → OpenAPI 3.1 JSON

# Tests
pnpm lint && pnpm tsc --noEmit && pnpm test  # all pass (905 tests)
```

---

*Delete this file when the PR merges.*
