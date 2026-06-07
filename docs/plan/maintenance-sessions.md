# Folio — Maintenance Audit Sessions

**Created:** 2026-06-07  
**Status:** In progress — approach agreed; session prompts TBD

---

## Goal

Audit and clean up code quality across the codebase without a dedicated feature sprint.

Not: new features, architectural changes, or large refactors.  
Yes: test quality, convention compliance, type safety, coverage gaps, dead code.

---

## Approach: Module-Based Audit (one-time experiment)

Each session audits **one module** — its routes, services, repositories, and tests — against the full audit checklist below. Fixes are applied in the same session and land as a PR.

**Why module-based (not concern-type rotation):**
- Each PR is domain-isolated: no merge conflicts regardless of review timing
- Each session is naturally bounded by the module's file count
- All concern types are checked per module, so nothing is missed

**Session structure:**
1. Read the module's routes, services, repositories, and test files
2. Work through the audit checklist (§ Audit Checklist below)
3. Apply all fixes found
4. Run `pnpm lint && pnpm tsc --noEmit && pnpm test` — all must pass
5. Create a branch (`chore/{module}-audit`) and PR

**Scheduling:** One-time experiment. Seven sessions, one per module, 6 hours apart starting June 8 00:00 AEST.

---

## Modules

| # | Module | Routes | Lib | Tests |
|---|--------|--------|-----|-------|
| 1 | properties | `app/api/properties/` | `lib/property/` | `__tests__/api/properties*.test.ts`, `__tests__/lib/property/` |
| 2 | loans | `app/api/loans/` | `lib/borrowings/` | `__tests__/api/loan*.test.ts`, `__tests__/lib/borrowings/` |
| 3 | aggregate | `app/api/portfolio/`, `app/api/reports/`, `app/api/ledger/` | `lib/aggregate/` | `__tests__/api/portfolio*.test.ts`, `__tests__/api/reports*.test.ts`, `__tests__/api/ledger*.test.ts`, `__tests__/lib/aggregate/` |
| 4 | ingestion | `app/api/ingestion/`, `app/api/upload/`, `app/api/extract/`, `app/api/documents/` | `lib/ingestion/` | `__tests__/api/ingestion*.test.ts`, `__tests__/api/upload*.test.ts`, `__tests__/api/extract*.test.ts`, `__tests__/api/documents*.test.ts` |
| 5 | entities | `app/api/entities/` | `lib/entities/` | `__tests__/api/entities.test.ts` |
| 6 | household | `app/api/household/` | `lib/household/` | `__tests__/api/household*.test.ts` |
| 7 | plan | `app/api/plan/` | `lib/plan-*.ts` | `__tests__/api/plan*.test.ts`, `__tests__/lib/plan-*.test.ts` |

---

## Audit Checklist

Every session works through all items below within its module scope.

### A. Auth checks
**Convention:** `docs/conventions.md §3 — Authentication`  
**Test rule:** `docs/testing-strategy.md §Critical Paths §4`

- Every route handler calls `supabase.auth.getUser()` before any business logic
- Every route test file has a "returns 401 when not authenticated" test

---

### B. API convention compliance
**Convention:** `docs/conventions.md §3`

- No `PUT` — partial updates use `PATCH`
- `POST` returns 201; `GET`, `PATCH`, `DELETE` return 200
- Collection `GET` response: `{ {resources}: [...] }`
- Single resource `GET`/`PATCH`/`POST` response: `{ {resource}: {...} }`
- `DELETE` response: `{ success: true }`
- All error responses: `{ error: string }` — no 422 status codes
- All request bodies parsed with Zod `safeParse` — no raw `request.json()` without schema validation

---

### C. Route structure
**Convention:** `docs/conventions.md §1`, `docs/testing-strategy.md — Route tests that use @/lib/db directly`

- Route handlers are thin adapters: no Drizzle queries directly in route files
- All DB queries live in `lib/{domain}/repositories/`
- No `import { db } from '@/lib/db'` in route handlers

---

### D. Soft-delete filter completeness
**Convention:** `docs/conventions.md §4 — Soft deletes`  
**Test rule:** `docs/testing-strategy.md §Critical Paths §2`

- Every query on a table with `deletedAt` includes `isNull(table.deletedAt)` in the WHERE clause
- Exception: staleness `MAX(updatedAt)` queries — these must have a comment explaining the intentional omission
- Each soft-deletable table in the module has at least one integration test proving the filter is applied

---

### E. Integration coverage for critical paths
**Test rule:** `docs/testing-strategy.md §Critical Paths §1–5`

For each critical path that exists in this module, verify a corresponding integration test exists:
- Soft-delete filter (§2): integration test inserts, soft-deletes, asserts gone
- Date-range filter (§3): integration test with an out-of-range row that should be excluded
- User isolation (§5): integration test asserts user A cannot see user B's data
- Financial calculations (§1): pure function tested exhaustively without mocking

---

### F. Type safety
**Convention:** `docs/conventions.md §5`

- No `any` in function signatures or variable declarations
- No `as SomeType` casts in business logic — Zod eliminates the need
- No `as unknown as X` double-casts
- DB row types via `typeof table.$inferSelect` only — no hand-written interfaces matching DB shapes
- Explicit return types on non-trivial `lib/` functions
- No `process.env.X` access outside `lib/env.ts`

---

### G. Test false positives
**Test rule:** `docs/testing-strategy.md §Test false positive patterns` *(section to be written — see below)*

- Unit tests assert on computed output, not on what the mock was told to return
- Removing the route handler body would cause the test to fail

---

## Documentation Gaps

Before writing session prompts, one gap needs filling:

**G — Test false positive patterns** is not currently documented. `docs/testing-strategy.md` explains *why* unit tests can't verify WHERE clauses, but doesn't define what a false positive unit test looks like or how to identify one. A new section needs to be added to `docs/testing-strategy.md` before the session prompt for item G can reference it cleanly.

All other checklist items point to existing documentation.

---

## Next Steps

1. ✅ Agree on approach (module-based, one-time experiment)
2. ✅ Define audit checklist and map to documented conventions
3. Add §Test false positive patterns to `docs/testing-strategy.md`
4. Write session prompts — one self-contained prompt per module that references the checklist and convention docs
5. Schedule via `/schedule` — 7 sessions, 6 hours apart, starting June 8 00:00 AEST
