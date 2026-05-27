# Folio — CLAUDE.md

@docs/conventions.md
@docs/testing-strategy.md
@docs/project.md

## Git — non-negotiable before any code change

**Always create a branch before making any edits.** Never commit to `main`.

```
git checkout -b {type}/{short-description}   # do this first, before touching any file
```

After all work is done and verified: commit to the branch, push, open a PR via `gh pr create`.

## Stack
- **Next.js 16** (App Router, TypeScript, `strict: true`)
- **Supabase** — auth (SSR cookies), Postgres, Storage; local at `http://127.0.0.1:54321`
- **Drizzle ORM** — schema at `db/schema.ts`, migrations via `pnpm db:migrate`
- **Vercel AI SDK + Anthropic** — `lib/extraction/parse.ts`
- **Vitest** — unit + integration (separate configs)
- **pnpm** — always use pnpm, not npm/yarn/bun

## Commands
| Task | Command |
|------|---------|
| Dev server | `pnpm dev` |
| Unit tests | `pnpm test` |
| Watch tests | `pnpm test:watch` |
| Integration tests | `pnpm test:integration` |
| Type check | `pnpm tsc --noEmit` |
| DB codegen | `pnpm db:generate` |
| DB migrate | `pnpm db:migrate` |
| Seed | `pnpm seed` |
| Supabase reset | `pnpm db:reset` |

## Project Layout
```
app/
  api/{upload,extract,statements,properties,reports}/route.ts
  (auth, dashboard, upload, properties, reports pages)
db/schema.ts          — Drizzle table definitions + exported types
lib/
  extraction/         — PDF → text → AI extraction pipeline
  supabase/{client,server}.ts
  db.ts               — Drizzle client
  logger.ts           — debug/info/error (LOG_LEVEL=debug for verbose)
supabase/migrations/  — SQL migrations (applied to local + prod)
__tests__/            — Vitest unit tests (*.test.ts)
                        integration tests (*.integration.test.ts)
docs/solutions/       — documented solutions to past bugs and patterns (searchable by module, tags, problem_type)
```

## Testing Conventions
- Unit tests mock at the boundary (Supabase, DB, AI); no real I/O
- Integration tests use `pool: 'forks'` and run sequentially (DB safety)
- **Always verify changes with tests before finishing**: `pnpm test` (unit), `pnpm test:integration` (integration), `pnpm test:e2e` (e2e) — run whichever suites are relevant to the change

## Pre-commit Checklist
Run all three before every commit — these match what CI checks:
```
pnpm lint
pnpm tsc --noEmit
pnpm test
```
Integration tests (`pnpm test:integration`) require `supabase start`; run them when the change touches DB queries, migrations, or storage.

## Key Patterns
- **API error shape**: `{ error: string, detail?: string }` — `error` is user-facing,
  `detail` is extra context for debugging
- **Auth in API routes**: always `createServerSupabaseClient()` → `supabase.auth.getUser()`
  before any business logic; return 401 if no user
- **Logging**: use `logger.debug/info/error` from `lib/logger.ts`; set `LOG_LEVEL=debug`
  in `.env.local` to enable verbose output (default: info, debug suppressed)
- **Storage uploads**: `upsert: false`; hash-based dedup happens before upload

## Supabase Local Dev
- Studio: http://127.0.0.1:54323
- Storage admin (bypass RLS): use secret key
  (`sb_secret_...` from `supabase status` / `.env.local`)
- Storage objects delete via SQL is blocked — use Storage API or Studio

## Known Gotchas
- **`lib/env.ts` is server-only**: it eagerly calls `requireEnv()` at module load time.
  Never import it from client components, `middleware.ts`, or `lib/supabase/client.ts` —
  those run in the browser or edge runtime where server-only env vars don't exist.
  Use `process.env.NEXT_PUBLIC_*` directly in those files (Next.js inlines them at build time).
- `StorageApiError`: check `.statusCode` (string, e.g. `'409'`) not `.status`
  (numeric — can be wrong, confirmed in error logs)
- After schema changes run `pnpm db:generate` then `pnpm db:migrate`
- **Never run `supabase db reset --local` directly** — use `pnpm db:reset` instead. The bare supabase reset wipes the `public` schema but leaves `drizzle.__drizzle_migrations` intact, causing drizzle to believe old migrations are applied when they aren't. `pnpm db:reset` drops the drizzle tracking schema first so the subsequent migrate starts clean.
- **Never manually edit `drizzle/meta/_journal.json`** — manual edits are the primary way `when` timestamps end up out of order. `drizzle-kit generate` always uses `Date.now()` so normal usage is safe; only manual edits create the risk. If timestamps ever become non-monotonic, fix them and run `pnpm db:reset` — out-of-order entries are silently skipped forever once a higher-timestamped migration is applied.
- **Never use `drizzle-kit push`** — it applies schema diffs directly to the DB without creating migration files or recording anything in `drizzle.__drizzle_migrations`. The DB ends up ahead of the migration history, causing "already exists" errors on the next `pnpm db:migrate` run.
- **Drizzle journal `when` timestamps must be monotonically increasing** — `drizzle-orm`'s `migrate()` skips any migration where `folderMillis <= lastDbMigration.created_at`. If the journal is ever squashed or reordered, entries that end up with `when` values lower than a previously-applied migration will be silently ignored forever.
- **`pnpm db:migrate` uses `scripts/migrate.ts`, not `drizzle-kit migrate`** — the custom script connects via the session pooler with `prepare: false` (required for PgBouncer). The Supabase direct connection (`db.<ref>.supabase.co`) is IPv6-only and unreachable from both local machines and GitHub Actions runners. `DATABASE_URL_DIRECT` should be set to the session pooler URL (`pooler.supabase.com:5432`).
- Supabase migration applied ≠ bucket visible in Studio storage browser sometimes;
  use `curl` with secret key to verify
- **unpdf / pdfjs-dist**: must be in `serverExternalPackages` in `next.config.ts`
  or Turbopack breaks the worker file path at runtime. `pdf-parse@2.x` was removed —
  it pulled in `pdfjs-dist@5` which requires `DOMMatrix` (browser API) and fails in
  Vercel serverless. `unpdf` is the replacement — handles Node.js compat internally.
- **supabase-ssr cookie format** (for curl testing): cookie name `sb-127-auth-token`,
  value = `"base64-" + base64url(JSON.stringify(session))` where `session` is the full
  JSON from the Supabase auth REST endpoint (no double-encoding)

## Maintenance
Update this file at slice boundaries when new patterns, gotchas, or architectural
decisions are confirmed stable. Dynamic per-session notes go in memory/MEMORY.md instead.