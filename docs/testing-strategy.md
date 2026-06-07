# Folio — Testing Strategy

Read at the start of any session that touches tests, financial logic, or data-safety code.

---

## Testing Tiers

| Tier | Tool | When to use |
|------|------|-------------|
| Unit | Vitest (`pnpm test`) | Business logic, validation, route contracts. Mock at the DB + Supabase boundary. |
| Integration | Vitest integration config (`pnpm test:integration`) | WHERE clause correctness, soft-delete filters, cross-table FK behaviour. Hits the real local DB — requires `supabase start`. |
| E2E | Playwright (`pnpm test:e2e`) | Full user flows in a real browser: sign-in, upload, report generation. Run locally before UI changes. |

### The critical limitation of unit tests

Unit tests mock the DB at the query boundary. They can verify that the route calls the right query *shape*, but **cannot verify that a WHERE clause contains the right conditions**.

Anything that depends on a WHERE clause being correct — soft-delete filters, date-range filters, RLS user-scoping — needs an integration test or an explicit code-review checkpoint. Writing a unit test that "covers" a soft-delete query is insufficient; if the `isNull(deletedAt)` condition is missing, the unit test will still pass.

### Test false positive patterns

A unit test is a false positive when it passes even if the route handler logic is completely wrong. This happens when the mock is set up to return exactly what the assertion expects, with no real computation in between — the test is asserting the mock, not the route.

**The pattern to look for:**

```typescript
// BAD — mock echo: the mock returns what the assertion checks.
// If the handler body were deleted, this test would still pass.
mockGetProperties.mockResolvedValue([{ id: '1', address: '123 St' }])
// ... call route ...
expect(body.properties[0].address).toBe('123 St')
```

The tell: mock setup and response assertion are mirrors. The route contributes nothing the test can detect.

**What a good route unit test verifies instead:**

- Auth guard fires → returns 401 when `getUser` returns null
- Input validation fires → returns 400 for each class of invalid input
- Service/repository called with correct arguments → especially `userId` from the auth session (cross-user isolation at the unit level)
- Service errors propagate correctly → returns 404 when service returns null/empty
- Response is correctly shaped → status code, wrapper key, error shape

These cases test *route behavior*, not mock pass-through. A happy-path test that only checks data flows through is only useful when it also asserts what arguments the mock was called with.

**How to fix a false positive:**

1. Add the missing error-case tests (401, 400, 404) if absent — these are almost never false positives
2. For the happy-path test: assert `expect(mockService).toHaveBeenCalledWith(expect.objectContaining({ userId }))` to verify the route is scoping correctly
3. If the route does a non-trivial transformation (mapping, filtering, computing), test that the output differs from the raw mock return in a way that proves the transformation ran

**False positives are not always wrong, but they are always incomplete.** A route that truly does nothing except call a service and return its result is correctly tested by a thin happy-path test — *if* it also has auth, validation, and argument-assertion tests alongside it. The risk is when the happy-path test is the *only* test, giving false confidence.

---

### Route tests that use `@/lib/db` directly must mock it

`lib/db.ts` imports `lib/env.ts`, which calls `requireEnv('DATABASE_URL')` at module load time. If a route handler imports `db` directly and the test does not mock `@/lib/db`, the test will throw `Missing required environment variable: DATABASE_URL` in CI (where `.env.local` is absent).

**Rule:** any test that imports a route which has `import { db } from '@/lib/db'` must include a `vi.mock('@/lib/db', ...)` call. See `__tests__/api/entities.test.ts` for the established mock pattern.

**Preferred fix:** avoid importing `db` in route handlers at all. Route handlers are thin adapters — any query that needs to go direct to the DB belongs in a repository function in `lib/{domain}/repositories/`. That keeps the mock boundary clean and prevents this class of failure entirely.

---

## Critical Paths

### 1. Financial calculations

**Risk:** Wrong totals corrupt every downstream report and flag.

**Rule:** Financial aggregation logic must live in a pure function (no DB, no I/O) so it can be tested exhaustively without mocking. Changes to aggregation logic require unit tests before the change — not after.

**What to test:** all category-to-bucket mappings (rent, expenses, mortgage), net formulas (before and after mortgage), per-property isolation (entries for property A must not affect property B totals), and all flag conditions (missing statement, missing mortgage payment).

**Example:** `lib/aggregate/services/compute.ts` + `__tests__/lib/reports-compute.test.ts`

### 2. Soft-delete WHERE clause correctness

**Risk:** Soft-deleted records reappear in queries, producing phantom data.

**Rule:** Any query on a table that has a `deletedAt` column must include `isNull(table.deletedAt)` in the WHERE clause. The only exception is intentional staleness checks (e.g. `MAX(updatedAt)` queries that must see deleted rows to detect changes). **This cannot be verified by a unit test** — it requires an integration test that inserts a row, soft-deletes it, and asserts the route no longer returns it.

**What to test:** each soft-deletable table needs at least one integration test that proves the filter is applied. If a route joins multiple soft-deletable tables, both conditions need testing (deleting via table A hides the record; deleting via table B also hides it).

**Example:** `__tests__/api/documents.integration.test.ts` — verifies `GET /api/documents` applies `isNull` to both the ledger entry and the source document

### 3. Date-range filter correctness

**Risk:** Entities outside the requested period (e.g. ended loan accounts) are included in results, generating false-positive flags.

**Rule:** Any route that filters time-bounded entities (loans, properties, etc.) by an overlap condition (`startDate <= periodEnd AND endDate >= periodStart`) must have an integration test with a row that sits outside the period. Unit tests cannot verify this because the filter is in the DB query.

**What to test:** a record that ended before the period (should be excluded), a record that starts after the period (should be excluded), and a record that overlaps (should be included).

**Example:** `__tests__/api/ledger-summary.integration.test.ts` — verifies loan accounts are excluded from `missingMortgages` flags when they fall outside the date range

### 4. Auth check on every route

**Risk:** An unauthenticated request reaches business logic.

**Rule:** Every route handler must check auth before any business logic. Every route test file must have a "returns 401 when not authenticated" test. This is a code-review checkpoint — no new route is complete without it.

### 5. RLS user isolation

**Risk:** User A reads or modifies User B's data.

**Coverage at two levels:**
- *Application-layer:* route handlers must pass `userId` from the authenticated session into the DB WHERE clause. Unit tests verify this by simulating a different userId and asserting the mock DB returns nothing for that user.
- *DB-layer:* every table must have an explicit RLS policy (see `docs/conventions.md §4`). Where possible, integration tests should verify cross-user isolation by operating as two different users against the real DB.

**Rule:** any route that accepts an external ID in the request body (e.g. `sourceDocumentId`) must include `AND user_id = caller_id` in the ownership lookup before trusting that ID.

---

## Integration Test Setup

Integration tests require:
```
supabase start
TEST_USER_EMAIL=...
TEST_USER_PASSWORD=...
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local anon key>
```

All integration tests use an `if (!hasEnv) return` guard — they silently skip if credentials are not set.

**CI status:** integration tests run in CI. The test user is created via the Supabase admin API; `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` are injected as workflow env vars.

---

## Known Gaps

| Gap | Rationale | When to fix |
|-----|-----------|------------|
| `hasStatement` semantics | Any non-`loan_payment` entry counts as "has statement" — a manual expense entry satisfies the flag even without a PM statement. Deferred pending UX review of health check status display. | V4 UX refresh |
