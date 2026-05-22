---
status: active
type: feat
origin: docs/brainstorms/loan-domain-requirements.md
---

# Plan: Loan domain schema foundations

**Milestone:** Loan Domain Buildout — PR 1 of 4

---

## Summary

Add `loan_type`, `io_end_date`, and `interest_rate` to `installment_loans`, create the `loan_ledger` append-only table with RLS and soft-delete, and extend the PATCH route to accept the new fields.

This is the schema foundation for the full Loan domain milestone. It unblocks:
- PR 2 (loan detail page) — deferred pending updated visual designs from Claude Design
- PR 3a/3b (upload extension backend + frontend) — needs `loan_ledger` to exist

No API routes for reading/writing `loan_ledger` entries in this PR — those ship with PR 3a.

---

## Problem Frame

`installment_loans` currently tracks only lender, nickname, start/end dates, and property security. There is no way to record loan type (IO vs P&I), IO end date, or current interest rate — all high-value fields for investor planning. There is also no loan-domain event stream: `property_ledger.loan_payment` exists as a property cashflow concern, but the loan domain has no ledger table of its own.

---

## Scope Boundaries

### In scope
- `loanTypeEnum` pgEnum + `loan_type`, `io_end_date`, `interest_rate` columns added to `installment_loans` (all nullable)
- `loan_ledger` table: full column set, indexes, RLS policy, soft-delete via `deleted_at`
- Drizzle migration + codegen
- PATCH route + repository updated to accept and validate the three new fields
- Unit tests for the PATCH handler (new field validation paths)
- Type exports for the new enum and table

### Deferred to Follow-Up Work
- API routes to read/write `loan_ledger` entries — PR 3a (upload extension backend)
- Loan detail page UI showing the new fields — PR 2 (deferred pending visual designs)
- Loan statement upload parsing — PR 3a
- Manual repayment entry on the Repayments tab — PR 2

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| `loan_type` column type | `pgEnum('loan_type', ...)` | Consistent with `entity_type`, `property_type` — enum enforced at DB level |
| `loan_type` nullability | Nullable | Existing loans have no recorded type; a default would misrepresent real data |
| `interest_rate` storage type | `numeric(5, 2)` | Matches requirements spec; Drizzle returns numeric as string — route must validate as a number before passing to repository |
| `loan_ledger` FK cascade | `installment_loan_id` → CASCADE; `source_document_id` → SET NULL | Within-domain cascade is permitted (loans own their ledger); cross-domain FK uses SET NULL per `docs/data-model.md` principle 14 |
| PATCH validation style | Field-by-field `if ('field' in raw)` pattern | Consistent with the existing route; no Zod in the loan PATCH route yet |
| RLS policy | Manually appended to migration | Drizzle Kit generates `ENABLE ROW LEVEL SECURITY` but not the policy — must be added manually per `docs/conventions.md §4` |

---

## Implementation Units

### U1. Schema — extend installment_loans + create loan_ledger

**Goal:** Add the three new columns to `installment_loans` and define `loan_ledger` in `db/schema.ts`.

**Requirements:** New columns per requirements spec; `loan_ledger` table per data model spec (see origin)

**Dependencies:** None

**Files:**
- `db/schema.ts` (modify)

**Approach:**
- Add `export const loanTypeEnum = pgEnum('loan_type', ['interest_only', 'principal_and_interest'])` before the `installmentLoans` table definition
- Add to `installmentLoans` (after `entityId`): `loanType: loanTypeEnum('loan_type')`, `ioEndDate: date('io_end_date')`, `interestRate: numeric('interest_rate', { precision: 5, scale: 2 })` — all nullable
- Add `loanLedger` table with columns: `id`, `userId`, `installmentLoanId` (FK cascade delete), `paymentDate`, `amountCents`, `interestCents` (nullable), `principalCents` (nullable), `description` (nullable), `sourceDocumentId` (FK set null, nullable), `deletedAt` (nullable), `createdAt`
- Add indexes: `index('idx_loan_ledger_loan_date').on(t.installmentLoanId, t.paymentDate)`, `index('idx_loan_ledger_user').on(t.userId)`
- Add type exports: `LoanType`, `LoanLedger`, `NewLoanLedger`

**FK constraint name verification (63-char Postgres limit):**
- `loan_ledger_installment_loan_id_installment_loans_id_fk` → 55 chars ✓
- `loan_ledger_source_document_id_source_documents_id_fk` → 53 chars ✓
No explicit naming needed for `loan_ledger` FKs.

**Patterns to follow:** `db/schema.ts` — `entityTypeEnum` + `entities`; `propertyTypeEnum` + `properties`; `propertyManagementAgents` for `numeric` usage; `propertyLedger` for `deletedAt` soft-delete.

**Test expectation:** None — verified by `pnpm tsc --noEmit` passing and migration applying cleanly in U2.

**Verification:** `pnpm tsc --noEmit` passes with no errors on the new schema definitions.

---

### U2. Migration — Drizzle codegen + RLS policy

**Goal:** Generate the Drizzle migration and manually append the `loan_ledger` RLS policy.

**Requirements:** RLS policy on all new tables (`docs/conventions.md §4`)

**Dependencies:** U1

**Files:**
- `drizzle/0018_loan_domain.sql` (generated name assigned by Drizzle Kit)

**Approach:**
- Run `pnpm db:generate` — produces a migration with `CREATE TYPE "public"."loan_type"`, `ALTER TABLE "installment_loans" ADD COLUMN ...` (×3), `CREATE TABLE "loan_ledger"`, `ENABLE ROW LEVEL SECURITY ON "loan_ledger"`
- Manually append to the generated file:
  ```sql
  CREATE POLICY "users manage own loan_ledger"
    ON "loan_ledger" FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  ```
- Run `pnpm db:migrate` against local Supabase

**Patterns to follow:** `drizzle/0014_property_tenancies.sql`, `drizzle/0015_property_management_agents.sql` — both have the `CREATE POLICY` manually appended after Drizzle's `ENABLE ROW LEVEL SECURITY`.

**Test expectation:** None — verified by migration applying without error.

**Verification:** `pnpm db:migrate` succeeds; `pnpm test:integration` can access the new schema.

---

### U3. Repository + PATCH route — new loan fields

**Goal:** Extend `UpdateInstallmentLoanInput` and `updateInstallmentLoan` to accept the three new fields, and add their validation to the PATCH handler.

**Requirements:** Loan type and IO end date editable via the existing PATCH route (see origin — Overview tab, Loan terms section)

**Dependencies:** U1, U2

**Files:**
- `lib/borrowings/repositories/loans.ts` (modify)
- `app/api/properties/[id]/loans/[loanId]/route.ts` (modify)

**Approach:**

Repository (`lib/borrowings/repositories/loans.ts`):
- Extend `UpdateInstallmentLoanInput` with `loanType?: 'interest_only' | 'principal_and_interest' | null`, `ioEndDate?: string | null`, `interestRate?: string | null`
- Note: `numeric` columns are stored and returned as strings by Drizzle. The repository accepts `string | null` for `interestRate`; the route converts the incoming number to a string.
- Add the three fields to the `.set({...})` call in `updateInstallmentLoan`

Route (`app/api/properties/[id]/loans/[loanId]/route.ts`):
Follow the existing `if ('fieldName' in raw)` validation pattern:
- `loanType`: accept `'interest_only' | 'principal_and_interest' | null`; reject any other string with 400
- `ioEndDate`: accept a `YYYY-MM-DD` date string or `null`
- `interestRate`: accept a positive finite number or `null`; convert the number to a string before assigning to `updates.interestRate`

**Patterns to follow:** `app/api/properties/[id]/loans/[loanId]/route.ts` — existing `if ('lender' in raw)`, `if ('nickname' in raw)` validation pattern. `__tests__/api/loans-id.test.ts` — for test structure to mirror.

**Test scenarios:**
- PATCH `{ loanType: 'interest_only' }` → 200, returned loan has correct `loanType`
- PATCH `{ loanType: 'principal_and_interest' }` → 200
- PATCH `{ loanType: null }` → 200, field cleared
- PATCH `{ loanType: 'invalid_value' }` → 400
- PATCH `{ ioEndDate: '2027-06-30' }` → 200, IO end date set
- PATCH `{ ioEndDate: null }` → 200, cleared
- PATCH `{ interestRate: 6.35 }` → 200, returned `interestRate === '6.35'` (Drizzle returns numeric as string)
- PATCH `{ interestRate: -1 }` → 400 (negative rejected)
- PATCH `{ interestRate: null }` → 200, cleared
- Existing fields (lender, nickname, startDate, endDate) still update correctly
- Empty body `{}` → 400 "No fields to update"
- 401 when unauthenticated

**Verification:** Unit tests pass in U4; `pnpm tsc --noEmit` passes.

---

### U4. Tests — PATCH handler unit tests for new fields

**Goal:** Write unit tests covering the validation and update paths for the three new loan fields.

**Requirements:** Auth check on every route; field validation correctness (`docs/testing-strategy.md §4`)

**Dependencies:** U3

**Files:**
- `__tests__/api/loans-id.test.ts` (modify — add test cases for new fields)

**Approach:** Mirror the existing test structure. Mock `@/lib/borrowings` at the module boundary. Cover the test scenarios enumerated in U3.

**Patterns to follow:** `__tests__/api/loans-id.test.ts` — existing mock setup, auth helper, and field-by-field test structure.

**Test scenarios:** (implement the scenarios listed in U3)

**Verification:** `pnpm test` passes.

---

## System-Wide Impact

- `db/schema.ts` gains `loanTypeEnum` and `loanLedger` — new exports; no existing code is affected
- `installmentLoans` gains three nullable columns — existing queries that don't select them are unaffected; `$inferSelect` type gains optional fields automatically
- PATCH route gains new optional fields — existing callers that omit them are unaffected
- `POST /api/properties/[id]/loans` (new loan creation) is not updated in this PR — new loans created before PR 2 ships will have `null` for the three new fields; this is acceptable given all columns are nullable
- `property_ledger.loan_payment` entries are not touched — `loan_ledger` coexists as the loan domain's own event stream; the two tables serve different concerns

---

## Success Criteria

- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm test` passes
- [ ] `pnpm db:migrate` applies without errors against local Supabase
- [ ] `installment_loans` has `loan_type`, `io_end_date`, `interest_rate` columns
- [ ] `loan_ledger` table exists with correct indexes and RLS policy
- [ ] PATCH `/api/properties/[id]/loans/[loanId]` accepts and validates all three new fields
