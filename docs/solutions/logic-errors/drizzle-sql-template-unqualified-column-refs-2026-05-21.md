---
title: "Drizzle sql template: column refs in correlated subqueries need full table qualification"
date: 2026-05-21
category: docs/solutions/logic-errors
module: lib/property
problem_type: logic_error
component: database
symptoms:
  - Computed SQL column always returns null despite correct-looking raw SQL
  - Integration tests expecting a numeric value receive null; unit tests pass (mocked)
  - "Running the same query directly against Postgres returns the correct result"
root_cause: wrong_api
resolution_type: code_fix
severity: high
related_components:
  - testing_framework
tags:
  - drizzle
  - sql-template
  - correlated-subquery
  - column-reference
  - lvr
---

# Drizzle sql template: column refs in correlated subqueries need full table qualification

## Problem

Drizzle's `sql` tagged template renders `${table.column}` as just `"column"` — no table qualifier. Inside a subquery with its own `FROM` clause, PostgreSQL resolves the unqualified column name to the **subquery's own table**, not the outer query row. The correlated subquery never matches, and the computed field silently returns null for every row.

This affected `lvrPercent` in `listProperties`: properties with valuations always returned `null` instead of the computed LVR percentage.

## Symptoms

- A Drizzle `sql<number | null>` computed field returns null for every row, even when the underlying data exists
- Raw SQL run directly against the database returns the expected value
- Unit tests pass (repository is mocked; no actual SQL runs)
- Integration tests are the only way to detect it: tests expecting `70` or `0` receive `null`

## What Didn't Work

- Checking RLS policies — the `postgres` user has `bypassrls: true`, so RLS was not blocking the subquery
- Assuming `${properties.id}` generates `"properties"."id"` — it generates only `"id"`
- The generated SQL `WHERE property_id = "id"` inside `FROM property_valuations` resolves `"id"` to `property_valuations.id`, not `properties.id`; PostgreSQL never errors, it just returns no rows

## Solution

Replace Drizzle column interpolations in correlated subqueries with raw quoted table+column text:

**Before (silently broken):**
```ts
lvrPercent: sql<number | null>`
  CASE
    WHEN (
      SELECT value_cents FROM property_valuations
      WHERE property_id = ${properties.id}   -- renders as "id", not "properties"."id"
      ORDER BY valued_at DESC LIMIT 1
    ) > 0
    ...
```

**After (correct):**
```ts
lvrPercent: sql<number | null>`
  CASE
    WHEN (
      SELECT value_cents FROM property_valuations
      WHERE property_id = "properties"."id"  -- raw text, fully qualified
      ORDER BY valued_at DESC LIMIT 1
    ) > 0
    ...
```

Apply the same treatment to every column reference inside the subquery:
- `${properties.id}` → `"properties"."id"`
- `${properties.userId}` → `"properties"."user_id"` (note: use the DB column name, not the TS property name)

## Why This Works

Drizzle's `sql` template interpolates a `Column` object as just its column name (`"id"`), not its fully-qualified name (`"properties"."id"`). In a top-level `WHERE` clause this is unambiguous. Inside a correlated subquery with `FROM property_valuations`, the unqualified `"id"` is resolved by PostgreSQL to `property_valuations.id` — the subquery's own table. The CASE condition evaluates to NULL (no matching valuation rows), which is falsy, so the ELSE NULL branch fires for every outer row.

Using raw text in the template (`"properties"."id"`) bypasses Drizzle's column rendering and forces the fully-qualified reference that PostgreSQL needs to correlate back to the outer query.

## Prevention

- **Any time a Drizzle `sql` template contains a correlated subquery**, use raw table-qualified text for outer-row column references: `"tableName"."db_column_name"`. Do not use `${table.column}` — it drops the table qualifier.
- Use the **database column name** (snake_case), not the TypeScript property name, in raw text.
- **Integration tests are the only way to catch this.** Unit tests mock the repository, so the SQL is never executed. Any computed column using a correlated subquery should have a corresponding integration test that verifies the value is non-null when data exists.

Example integration test shape that would catch this:
```ts
it('both exist — returns rounded integer LVR', async () => {
  if (!hasEnv) return
  await db.insert(propertyValuations).values({ ... valueCents: 100_000_000 })
  await db.insert(installmentLoanBalances).values({ ... balanceCents: 70_000_000 })
  const rows = await listProperties(userId)
  const row = rows.find(r => r.id === propertyId)
  expect(row?.lvrPercent).toBe(70)  // would catch null
})
```

## Related Issues

- Integration test file: `__tests__/lib/property/list-properties-lvr.integration.test.ts`
- Fix commit: `refactor: qualify properties column refs in lvrPercent correlated subquery`
