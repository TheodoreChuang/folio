# Folio — Code Conventions

Agreed conventions. Read at the start of every session.
Deviations from these are cleanup tasks, not blockers.

---

## 0. Git Workflow

- `main` is the production branch — protected, no direct pushes
- All work happens on branches cut from `main`
- Branch naming: `{type}/{short-description}` — e.g. `fix/put-to-patch`, `chore/eslint`, `feat/zod-routes`
- One PR per logical unit of work
- CI must pass before merging
- Squash merge into `main` to keep history linear

---

## 1. File & Folder Structure

```
app/api/{resource}/route.ts              # collection: GET, POST
app/api/{resource}/[id]/route.ts         # single resource: GET, PATCH, DELETE
app/api/{resource}/[id]/{sub}/route.ts   # nested sub-resource
lib/{domain}/                            # domain module (see docs/architecture.md)
lib/{domain}/services/                   # business logic — no infrastructure imports
lib/{domain}/repositories/               # all DB queries for this domain
lib/{domain}/index.ts                    # public API — the only importable file
lib/supabase/                            # shared: Supabase client factories
lib/db.ts                                # shared: Drizzle client
lib/logger.ts                            # shared: structured logging
lib/env.ts                               # shared: environment variable access
db/schema.ts                             # all Drizzle tables + exported types (single file)
components/ui/                           # shadcn components only
components/*.tsx                         # app-specific shared components
__tests__/api/*.test.ts                  # unit tests mirroring app/api/
__tests__/lib/*.test.ts                  # unit tests mirroring lib/
playwright/tests/                        # e2e tests
scripts/                                 # runnable scripts (seed, migrations)
```

Route handlers are thin adapters: authenticate, parse input, call a domain service, return
a response. No business logic or Drizzle queries in route handlers. See `docs/architecture.md`
for the full module structure and the rationale.

---

## 2. Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | `kebab-case` | `date-ranges.ts`, `app-nav.tsx` |
| TS variables & functions | `camelCase` | `userId`, `computeReport` |
| TS types & interfaces | `PascalCase` | `Property`, `ReportTotals` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_BYTES`, `UUID_REGEX` |
| DB columns | `snake_case` | `user_id`, `amount_cents` |
| TS properties (DB rows) | `camelCase` | `userId`, `amountCents` |
| DB enum values | `snake_case` | `'loan_payment'`, `'pm_statement'` |
| DB index names | `idx_{table}_{column_or_purpose}` | `idx_ledger_user_month` |

DB column → TS property mapping is handled automatically by Drizzle. Never write
manual camelCase ↔ snake_case conversions.

---

## 3. API Route Pattern

### Authentication
Every handler, no exceptions:
```typescript
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### HTTP verbs
- `GET` — read
- `POST` — create → 201
- `PATCH` — partial update → 200
- `DELETE` — delete → 200
- Never use `PUT` — we do partial updates, which is PATCH semantics

### Request body parsing
Use Zod. Define a schema per handler, parse with `safeParse`:
```typescript
const schema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  type: z.enum(ENTITY_TYPES),
})
const parsed = schema.safeParse(await request.json().catch(() => null))
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
}
const { name, type } = parsed.data  // fully typed
```

Zod schemas are the API documentation — no separate spec or route summary comments.

### Response shape
- Collection GET: `{ {resources}: [...] }` — e.g. `{ entities: [...] }`
- Single GET / PATCH: `{ {resource}: {...} }` — e.g. `{ entity: {...} }`
- POST: `{ {resource}: {...} }` at 201
- DELETE: `{ success: true }` at 200
- Aggregation endpoints (not CRUD): own documented shape, not resource-wrapped

### Error shape
```typescript
{ error: string }              // user-facing validation and auth errors
{ error: string, detail: string }  // 5xx only, where context helps debugging
```

### Status codes
| Code | Use |
|------|-----|
| 200 | Success (GET, PATCH, DELETE) |
| 201 | Created (POST) |
| 400 | Validation error |
| 401 | Unauthenticated |
| 404 | Not found |
| 409 | Conflict (e.g. delete with dependents) |
| 413 | Payload too large |
| 500 | Server error |

Do not use 422.

---

## 4. Drizzle Query Patterns

```typescript
// Conditions: always and() — never chained .where()
db.select().from(table).where(and(eq(...), isNull(table.deletedAt)))

// Existence check: minimal field selection + .limit(1)
db.select({ id: table.id }).from(table).where(...).limit(1)

// Mutations: always .returning()
db.insert(table).values({...}).returning()
db.update(table).set({...}).where(...).returning()
db.delete(table).where(...).returning()

// Parallel independent queries: Promise.all()
const [props, loans] = await Promise.all([
  db.select().from(properties).where(...),
  db.select().from(loanAccounts).where(...),
])
```

**Soft deletes:** Every query on a table with `deletedAt` must include
`isNull(table.deletedAt)`. No exceptions. The only exception is staleness
`MAX(updatedAt)` queries which intentionally include deleted rows.

**Transactions:** Not currently used. If a route ever requires atomic multi-table
writes, use an explicit Drizzle transaction — do not rely on implicit ordering.

**RLS:** Every application table must have an explicit Row Level Security policy:
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own {table}"
  ON {table} FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```
Add these in the same migration that creates the table. The auto-enable trigger
in `drizzle/0001_rls.sql` handles `ENABLE ROW LEVEL SECURITY` automatically for
new tables, but does **not** add a policy — omitting the policy means deny-all
via PostgREST, which is inconsistent and will break if direct Supabase client
queries are ever added.

**PostgreSQL identifier limit (63 chars):** Drizzle auto-generates FK constraint names
as `{table}_{column}_{referenced_table}_{referenced_column}_fk`. For long table names
this can silently exceed Postgres's 63-char limit and get truncated. If adding a FK where
the auto-generated name would exceed 63 chars, supply an explicit name:
```ts
sourceDocumentId: uuid('source_document_id')
  .references(() => sourceDocuments.id, { onDelete: 'set null' }),
// If auto-name is >63 chars, use foreignKey() builder with an explicit name instead
```
The existing `property_ledger_entries_source_document_id_source_documents_id_fk` (66 chars)
was truncated on first cloud migration — the constraint works but the name is shorter than
in the schema definition. Not worth a corrective migration.

---

## 5. Type Safety

- `strict: true` in `tsconfig.json` — never downgrade
- No `any` — use `unknown` and narrow explicitly
- No `as` casts in route business logic — Zod eliminates the need
- SDK type gap workarounds (e.g. Supabase `StorageApiError`): isolate to a named
  utility function in `lib/`, never inline in route handlers
- No `as unknown as X` double-cast — always a sign something is wrong
- DB row types via `typeof table.$inferSelect` only — no hand-written interfaces
- Zod at all external input boundaries: request bodies and AI model output
- Explicit return types on non-trivial `lib/` functions

---

## 6. Environment Variables

All app environment variables are accessed through `lib/env.ts`:

```typescript
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  DATABASE_URL:             requireEnv('DATABASE_URL'),
  SUPABASE_URL:             requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  LOG_LEVEL:                process.env.LOG_LEVEL ?? 'info',
} as const
```

- Fail-fast: throws at module load time if a required var is missing
- No `process.env.X` or `process.env.X!` scattered across files — always import from `lib/env.ts`
- `NEXT_PUBLIC_` prefix exposes vars to the browser at build time — only use for vars
  intentionally public (Supabase URL and anon key are correct; secrets are not)
- `SUPABASE_SECRET_KEY` and `DATABASE_URL_DIRECT` are script-only — never imported
  into `app/` or `lib/`

---

## 7. Comments

No comments by default. Add a comment only when:

- A constraint could be silently violated by a future reader
  (e.g. `// always filter deleted_at IS NULL except staleness MAX query`)
- A config choice works around a specific platform bug or limitation
  (e.g. Turbopack + unpdf worker path, Supabase Transaction pooler `prepare: false`)
- A storage decision is non-obvious from the column name alone
  (e.g. `// SHA-256 for dedup`, `// always positive — category determines income vs expense`)

Do not write:
- Comments explaining what the code does (the code does that)
- Route summary comments — Zod schemas are the API contract
- Commented-out code — delete it, git history preserves it
- TODO comments — use GitHub issues

---

## 8. Table Patterns

Three patterns govern all tables. Every table must clearly belong to one.

### Entity tables — edit in place

Core domain objects with user-editable fields. Any column may be updated.

Examples: `properties`, `loan_accounts`, `bank_accounts`, `entities`,
`income_sources`, `personal_budget_items`

No naming suffix. The noun is sufficient.

### Ledger tables — append-only (`_ledger` suffix)

Financial event streams. A row records something that happened. Once written,
the record is permanent — it is part of the audit trail regardless of whether
it is later marked deleted.

Naming: `_ledger` suffix — `property_ledger`, `loan_ledger`, `bank_ledger`,
`income_ledger`.

Permitted operations:

| Operation | Allowed |
|---|---|
| `INSERT` | Yes |
| `UPDATE deletedAt` (soft delete) | Yes |
| `UPDATE` any other field | **No** |
| Hard `DELETE` | **No** |

Corrections are new rows, not updates to existing rows. If a transaction was
entered incorrectly, soft-delete the original and insert a corrected entry.
Never update `amount_cents`, `date`, `category`, or any financial field in place.

### Snapshot tables — append-only (descriptive plural name)

Point-in-time recordings of a value. A new measurement always produces a new
row — existing rows are never updated.

Examples: `property_valuations`, `loan_balances`

These already carry self-describing names (`_valuations`, `_balances`) that
imply their append-only nature. No additional suffix needed.

---

**How to decide which pattern applies:**

- Does the user edit this record directly (name, address, rate)? → Entity table
- Does this record capture a financial event (payment, income, expense)? → Ledger table
- Does this record capture a value at a point in time (balance, valuation)? → Snapshot table

---

## 9. Testing Strategy

### Backend — TDD

Write the test before the implementation for all route handlers, services, and repositories.
The test-first loop keeps handlers thin: if a handler is hard to test, it is doing too much
and logic belongs in a service.

Run the relevant suites before marking any backend work done:
- `pnpm test` — unit tests (always)
- `pnpm test:integration` — when the change touches DB queries, migrations, or storage

### Frontend — no unit tests by default

Component-level unit tests add friction without catching the bugs that matter (visual,
interaction, layout). Don't write them unless a component contains logic complex enough
to extract into a pure function — at which point the function belongs in the backend anyway.

Playwright e2e tests cover critical user paths. That is the frontend test investment.

### Logic belongs in the backend

Calculations, derivations, and business rules live in backend services — not in components,
hooks, or utility files on the frontend. The frontend receives computed values from the API
and renders them. This keeps backend logic testable under TDD and prevents business rules
from being scattered across the stack.
