# Folio — Maintenance Audit Session Prompts

One prompt per module. Each is self-contained — copy the full prompt when scheduling.

Scheduled order (6 hours apart, starting June 8 00:00 AEST):
1. properties
2. loans
3. aggregate
4. ingestion
5. entities
6. household
7. plan

---

## Session 1 — properties

```
You are running a one-time maintenance audit of the **properties** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/properties-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/properties/           (all route.ts files, recurse)
- lib/property/                 (all files, recurse)
- __tests__/api/properties*.test.ts
- __tests__/api/properties*.integration.test.ts
- __tests__/lib/property/       (all files)

Work through checklist items A–G from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

For item E (missing integration coverage): write new integration tests only if there is a clear existing example to model from in __tests__/api/ or __tests__/lib/. If unsure, flag the gap and leave it for manual review.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/properties-audit
Title: chore: properties module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found")
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```

---

## Session 2 — loans

```
You are running a one-time maintenance audit of the **loans** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/loans-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/loans/                 (all route.ts files, recurse)
- lib/borrowings/                (all files, recurse)
- __tests__/api/loan*.test.ts
- __tests__/api/loan*.integration.test.ts
- __tests__/lib/borrowings/      (all files)

Work through checklist items A–G from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

For item E (missing integration coverage): write new integration tests only if there is a clear existing example to model from in __tests__/api/ or __tests__/lib/. If unsure, flag the gap and leave it for manual review.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/loans-audit
Title: chore: loans module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found")
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```

---

## Session 3 — aggregate

```
You are running a one-time maintenance audit of the **aggregate** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/aggregate-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/portfolio/             (all route.ts files, recurse)
- app/api/reports/               (all route.ts files, recurse)
- app/api/ledger/                (all route.ts files, recurse)
- lib/aggregate/repositories/   (all files)
- lib/aggregate/services/       (all files)
- lib/aggregate/index.ts
- __tests__/api/portfolio*.test.ts
- __tests__/api/reports*.test.ts
- __tests__/api/ledger*.test.ts
- __tests__/lib/aggregate/      (all files)

Note: lib/aggregate/plan/ is audited in a separate session. Do not include it here.

Work through checklist items A–G from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

For item E (missing integration coverage): write new integration tests only if there is a clear existing example to model from in __tests__/api/ or __tests__/lib/. If unsure, flag the gap and leave it for manual review.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/aggregate-audit
Title: chore: aggregate module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found")
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```

---

## Session 4 — ingestion

```
You are running a one-time maintenance audit of the **ingestion** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/ingestion-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/ingestion/             (all route.ts files, recurse)
- app/api/upload/                (all route.ts files, recurse)
- app/api/extract/               (all route.ts files, recurse)
- app/api/documents/             (all route.ts files, recurse)
- lib/ingestion/                 (all files, recurse)
- __tests__/api/ingestion*.test.ts
- __tests__/api/ingestion*.integration.test.ts
- __tests__/api/upload*.test.ts
- __tests__/api/upload*.integration.test.ts
- __tests__/api/extract*.test.ts
- __tests__/api/extract*.integration.test.ts
- __tests__/api/documents*.test.ts
- __tests__/api/documents*.integration.test.ts
- __tests__/lib/ingestion-service.test.ts
- __tests__/lib/loan-ingestion-service.test.ts
- __tests__/lib/extraction.test.ts

Work through checklist items A–G from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

For item E (missing integration coverage): write new integration tests only if there is a clear existing example to model from in __tests__/api/ or __tests__/lib/. If unsure, flag the gap and leave it for manual review.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/ingestion-audit
Title: chore: ingestion module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found")
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```

---

## Session 5 — entities

```
You are running a one-time maintenance audit of the **entities** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/entities-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/entities/              (all route.ts files, recurse)
- lib/entities/                  (all files, recurse)
- __tests__/api/entities.test.ts

Work through checklist items A–G from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

For item E (missing integration coverage): write new integration tests only if there is a clear existing example to model from in __tests__/api/ or __tests__/lib/. If unsure, flag the gap and leave it for manual review.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/entities-audit
Title: chore: entities module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found")
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```

---

## Session 6 — household

```
You are running a one-time maintenance audit of the **household** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/household-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/household/             (all route.ts files, recurse)
- lib/household/                 (all files, recurse)
- __tests__/api/household*.test.ts
- __tests__/api/household*.integration.test.ts
- __tests__/lib/household-compute.test.ts

Work through checklist items A–G from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

For item E (missing integration coverage): write new integration tests only if there is a clear existing example to model from in __tests__/api/ or __tests__/lib/. If unsure, flag the gap and leave it for manual review.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/household-audit
Title: chore: household module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found")
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```

---

## Session 7 — plan

```
You are running a one-time maintenance audit of the **plan** module in the Folio codebase.

Folio is a Next.js 16 (App Router) property investment dashboard. Stack: TypeScript strict mode, Supabase auth, Drizzle ORM, Vitest, pnpm. Working directory: the repo root.

## Step 1 — Read the conventions

Before touching any file, read these three documents in full:
- docs/conventions.md
- docs/testing-strategy.md
- docs/plan/maintenance-sessions.md (the Audit Checklist section, items A–G)

These are your source of truth. Do not apply rules from memory — apply rules from these docs.

## Step 2 — Create a branch

git checkout -b chore/plan-audit

## Step 3 — Audit scope

Audit only the following paths:
- app/api/plan/                  (all route.ts files, recurse)
- lib/aggregate/plan/            (all files, recurse)
- __tests__/api/plan*.test.ts
- __tests__/lib/plan-*.test.ts

Note: the plan calculators in lib/aggregate/plan/calculators/ are pure functions (no DB, no auth). For these files, checklist items A, C, and D do not apply. Focus on F (type safety) and G (false positives) for the calculators, and the full checklist for app/api/plan/.

Work through the applicable checklist items from docs/plan/maintenance-sessions.md against these files. For each item, grep and read relevant files before concluding anything is clean.

Fix violations as you find them. If a fix would require a significant rewrite of a test (more than adding a missing case or correcting an assertion), flag it in the PR body instead of auto-fixing.

## Step 4 — Validate

Run all three — all must pass before creating the PR:
  pnpm lint
  pnpm tsc --noEmit
  pnpm test

Do not run pnpm test:integration (requires supabase start).
Fix any errors in files you touched. Do not suppress lint or type errors.

## Step 5 — Create PR

Branch: chore/plan-audit
Title: chore: plan module audit

PR body must include:
- One line per checklist item (A–G): what was checked, what was found, what was fixed (or "nothing found"; note "N/A — pure functions" where applicable)
- Any violations flagged for manual review with a short explanation of why they were not auto-fixed
- Confirmation that pnpm lint, pnpm tsc --noEmit, and pnpm test all passed
```
