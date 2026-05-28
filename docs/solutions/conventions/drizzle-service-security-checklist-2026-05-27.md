---
title: Drizzle service security and correctness checklist
date: 2026-05-27
category: conventions
module: lib/ingestion
problem_type: convention
component: service_object
severity: high
applies_when:
  - Writing a new Drizzle service that accepts external IDs from clients
  - Adding mutation methods that operate on user-scoped data
  - Implementing multi-step operations (stage + commit, create + associate)
tags:
  - drizzle
  - service-object
  - security
  - user-scoping
  - transactions
  - inarray
  - soft-delete
  - ownership-verification
---

# Drizzle service security and correctness checklist

## Context

A multi-agent code review on `lib/ingestion/services/loan-ingestion.ts` (PR #56) surfaced a cluster of correctness and security omissions — 2 P0s, 8 P1s, and several P2 findings. Most were checks present in the PM equivalent service (`lib/ingestion/services/ingestion.ts`) that weren't carried over to the new loan service. The gaps are easy to miss when building a new service by analogy. This checklist captures every pattern so future services don't repeat the same omissions.

## Guidance

### 1. Empty array guard before `inArray()`

`inArray(col, [])` with an empty array has undefined behavior in Drizzle/Postgres — it may produce a syntax error or an always-false clause. Guard at entry for any function that accepts an array of IDs:

```typescript
// ✅ Guard first
if (sourceDocumentIds.length === 0) return { committed: 0 }

// Then safe to use inArray:
inArray(sourceDocuments.id, sourceDocumentIds)
```

### 2. `userId` on every mutation WHERE clause

Every `UPDATE` and `DELETE` must scope to `userId`, not just the record ID. A record ID alone can be guessed or passed by a malicious client:

```typescript
// ❌ Missing userId — any record ID accepted
.where(eq(sourceDocuments.id, sourceDocumentId))

// ✅ Scoped to user
.where(and(
  eq(sourceDocuments.id, sourceDocumentId),
  eq(sourceDocuments.userId, userId),
))
```

### 3. `isNull(table.deletedAt)` on soft-deletable table queries

Any ownership check or query against a table with `deletedAt` must include this filter. Omitting it lets soft-deleted records pass ownership gates:

```typescript
// ❌ Soft-deleted doc can pass ownership check
.where(and(
  eq(sourceDocuments.userId, userId),
  inArray(sourceDocuments.id, sourceDocumentIds),
))

// ✅ Correct
.where(and(
  eq(sourceDocuments.userId, userId),
  inArray(sourceDocuments.id, sourceDocumentIds),
  isNull(sourceDocuments.deletedAt),
))
```

Tables with `deletedAt`: `source_documents`, `property_ledger`, `loan_ledger`, `property_tenancies`, `property_management_agents`.

### 4. Referenced ID ownership verification

If a service accepts an external ID set by the client (e.g., `installmentLoanId` patched onto a staging item via the UI), verify it belongs to `userId` before writing. Ownership of the staging item doesn't imply ownership of the referenced entity:

```typescript
// After confirming no null installmentLoanIds:
const loanIds = [...new Set(committable.map(item => item.installmentLoanId))]
const ownedLoans = await db
  .select({ id: installmentLoans.id })
  .from(installmentLoans)
  .where(and(
    eq(installmentLoans.userId, userId),
    inArray(installmentLoans.id, loanIds),
  ))
if (ownedLoans.length !== loanIds.length) {
  throw new Error('One or more loans not found or not owned by user')
}
```

### 5. Transaction wrapping for multi-step operations

Update + insert, or delete + insert, must be one transaction. A partial failure otherwise leaves the DB inconsistent (e.g., period dates updated but no staging rows written):

```typescript
// ❌ Two independent operations — partial failure is possible
await db.update(sourceDocuments).set({...}).where(...)
const inserted = await db.insert(loanStagingItems).values(rows).returning()

// ✅ Atomic
let stagedCount = 0
await db.transaction(async (tx) => {
  await tx.update(sourceDocuments).set({...}).where(...).returning()
  const inserted = await insertLoanStagedItems(tx, rows)
  stagedCount = inserted.length
})
```

### 6. Soft-delete prior ledger rows before re-commit

When committing a source document that may have been committed before, soft-delete existing ledger rows for the same `sourceDocumentId` inside the transaction before inserting new ones. Without this, re-committing creates duplicate ledger entries:

```typescript
await tx
  .update(loanLedger)
  .set({ deletedAt: new Date() })
  .where(and(
    eq(loanLedger.userId, userId),
    inArray(loanLedger.sourceDocumentId, sourceDocumentIds),
    isNull(loanLedger.deletedAt),
  ))
  .returning()
// then insert new ledger rows
```

This pattern is in both `commitStagedItems` (PM) and `commitLoanStagedItems` (loan) — any new commit function needs it too.

### 7. Type predicate instead of `as` cast for nullable narrowing

When filtering to non-null items and then using that field, use a type predicate. `as string` casts are prohibited by `docs/conventions.md §5`:

```typescript
// ❌ as-cast — bypasses TypeScript
item.installmentLoanId as string

// ✅ Type predicate — narrows the array element type
const committable = approved.filter(
  (item): item is typeof item & { installmentLoanId: string } => item.installmentLoanId !== null
)
// committable[n].installmentLoanId is string — no cast needed
```

### 8. `DrizzleTx` type for transaction-aware repository functions

Repository functions that must run inside a caller's transaction accept `DrizzleTx` (exported from `lib/db.ts`) instead of calling `db` directly. The service owns the `db.transaction()` boundary and passes `tx` into the repository:

```typescript
// lib/ingestion/repositories/loan-staging.ts
import type { DrizzleTx } from '@/lib/db'

export async function insertLoanStagedItems(
  tx: DrizzleTx,
  items: NewLoanStagingItem[],
): Promise<LoanStagingItem[]> {
  return tx.insert(loanStagingItems).values(items).returning()
}

// lib/ingestion/services/loan-ingestion.ts
await db.transaction(async (tx) => {
  const inserted = await insertLoanStagedItems(tx, rows)
  stagedCount = inserted.length
})
```

`DrizzleTx` is defined in `lib/db.ts` as `Parameters<Parameters<typeof db.transaction>[0]>[0]`.

### 9. `.returning()` on every mutation

Project convention (`docs/conventions.md §4`): every `INSERT`, `UPDATE`, and `DELETE` calls `.returning()` — including inside transactions.

## Why This Matters

Missing any of these allows:

- **Runtime errors** — `inArray` with empty array crashes or silently returns wrong results
- **Duplicate ledger entries** — re-commit without soft-delete creates phantom financial data
- **Privilege escalation** — operating on another user's loan via a guessed or injected ID
- **Auth bypass** — soft-deleted document passes ownership gate
- **Inconsistent DB state** — partial failure of multi-step operation leaves orphaned rows

## When to Apply

- Writing any new service under `lib/ingestion/services/`
- Any new Drizzle service that accepts external IDs or commits data on behalf of a user
- Reviewing a PR that introduces a new mutation service

## Examples

Reference implementations:
- `lib/ingestion/services/loan-ingestion.ts` — implements all patterns (post-PR #56)
- `lib/ingestion/services/ingestion.ts` — PM equivalent, the original reference
- `lib/ingestion/repositories/loan-staging.ts` — `DrizzleTx` repository pattern

## Related

- `docs/solutions/logic-errors/service-where-clause-missing-property-scope-2026-05-20.md` — same class of scoping omission in property services
