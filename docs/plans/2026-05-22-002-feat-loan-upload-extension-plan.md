---
status: active
type: feat
origin: docs/brainstorms/loan-domain-requirements.md
---

# Plan: Loan upload extension

**Milestone:** Loan Domain Buildout — PR 3 of 4 (split into Phase A backend + Phase B frontend)

**Prerequisite:** `2026-05-22-001-feat-loan-domain-schema-plan.md` merged (`loan_ledger` must exist)

---

## Summary

Extend the upload flow to parse loan bank statements into `loan_ledger`. Phase A is a backend PR covering schema, AI extraction, staging/commit services, and API routes. Phase B is a frontend PR wiring the upload wizard review UI for loan statements.

The staging decision from the brainstorm is resolved: a separate `loan_staging_items` table replaces the option of extending `document_staging_items`. Research confirmed `document_staging_items.category` is `NOT NULL` and its commit path is hardcoded to write `property_ledger` entries requiring a non-null `propertyId` — both would require invasive branching of shared infrastructure.

Note: PR 2 (loan detail page Repayments tab — which displays `loan_ledger` entries) is deferred pending updated visual designs from Claude Design. It will be a separate plan once designs are ready.

---

## Problem Frame

The upload flow currently only handles PM statements. Loan bank statements cannot be uploaded: there is no extraction prompt for the loan statement format, no staging table for loan payment entries, and no commit path to `loan_ledger`. The `loan_ledger` table (added in PR 1) needs population; statement upload is one of two entry paths (the other is manual entry via the Repayments tab in PR 2).

---

## Scope Boundaries

### In scope — Phase A (backend PR)
- AI document classification: `classifyDocument()` function that returns `pm_statement | loan_statement | unknown`
- `loan_staging_items` table: schema, migration, RLS
- Rename `document_staging_items` → `property_staging_items`: schema rename + migration
- AI extraction: `loanExtractionResultSchema` + `extractLoanStatementData` function
- `app/api/upload/route.ts`: make `documentType` optional (defaults to `unknown` when absent)
- `app/api/extract/route.ts`: classify first → update `source_documents.documentType` → branch to PM or loan extraction; return 422 on `unknown`
- Staging service: `stageLoanExtractionResult` → inserts into `loan_staging_items`
- Commit service: `commitLoanStagedItems` → writes to `loan_ledger`, hard-deletes staging rows
- API routes: GET loan staging sessions, PATCH staging item, POST loan commit
- Unit tests for services and routes; integration tests for soft-delete correctness and end-to-end flow

### In scope — Phase B (frontend PR)
- Remove document type selector from the upload page; `documentType` no longer sent in form data
- Upload page error handling for 422 unclassifiable documents ("Couldn't classify this document")
- Load installment loans in the upload wizard for the matching step
- Loan session matching UI: select which installment loan the statement belongs to
- Loan entry review UI: payment columns (date, amount, interest, principal)
- Loan commit flow calling `POST /api/ingestion/loan-commit`

### Deferred to Follow-Up Work
- Loan detail Repayments tab that displays `loan_ledger` entries — PR 2 (separate plan after designs ready)
- `source_document.periodStart/End` guard to prevent duplicate loan statement uploads (future)
- Closing balance cross-check with `installment_loan_balances` (future)
- AI-powered automatic loan matching by lender name / account number (future)

### Outside scope
- Extending bank statement upload to a bank ledger (separate domain)
- `loan_property_securities` (cross-collateralisation)

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Staging table design | One table per ledger destination: `property_staging_items` + `loan_staging_items` | Staging shape mirrors the ledger it feeds; DB-enforced types; multiple document types can route to the same staging table; see data-model.md Ingestion Domain |
| `document_staging_items` rename | Rename to `property_staging_items` | Aligns naming with the entity-based principle; "document" signals source type, "property" signals destination — destination is the right frame |
| FK naming on `loan_staging_items` | Explicit names (`lsi_source_doc_fk`, `lsi_installment_loan_fk`) | Follows the pattern established by `documentStagingItems` which already uses `foreignKey()` with explicit names (`dsi_source_doc_fk`, etc.) — consistency with the adjacent table is the primary reason |
| Document type resolution | Dedicated `classifyDocument()` AI call before extraction | Users upload without selecting type; two AI calls per document (classify then extract) is intentional — simpler to test, reason about, and extend than a combined classify+extract schema |
| Unknown document type | Return 422 from extract route; no staging rows created | Clear error surface; user sees "Couldn't classify" in the file status list; upload succeeded (PDF stored) so no data is lost |
| Extract route branching | Classify first → update `source_documents.documentType` → branch on classification result | PM and loan paths share auth, rate-limit, error handling — only the classify step is new; branching on AI result not stored type keeps the route self-contained |
| New extraction function | Separate `extractLoanStatementData` in `parse.ts` | Parallel to `extractStatementData`; different Zod schema with loan-specific fields (`interestCents`, `principalCents`, `closingBalanceCents`) |
| Loan commit endpoint | New `POST /api/ingestion/loan-commit` | Keeps PM and loan commit paths separate; avoids branching the existing commit route |
| `installmentLoanId` requirement | Hard validation on commit: reject if any approved item has null `installmentLoanId` | Matches the existing `propertyId` requirement for PM commits; unmatched entries cannot be committed |
| Staging row lifecycle | Hard-delete on commit (both approved + rejected) | Matches the existing PM pattern (`commitStagedItems` hard-deletes); staging rows are transient |
| Transaction in commit service | `commitLoanStagedItems` wraps ledger insert + staging delete in `db.transaction()` | Follows the established pattern in `commitStagedItems` (PM commit, `lib/ingestion/services/ingestion.ts:72`) — if ledger insert fails, staging rows are not deleted |

---

## High-Level Technical Design

*Directional guidance for review — not implementation specification.*

```
Upload (modified — documentType now optional)
  POST /api/upload
    any PDF → source_documents (documentType = 'unknown')
    storage path: documents/<userId>/documents/<filename>

Extract (modified)
  POST /api/extract
    1. classifyDocument(pdfText)          ← new
         → 'pm_statement' | 'loan_statement' | 'unknown'
    2. UPDATE source_documents SET documentType = result   ← new
    3. if 'unknown':
         return 422 { error: "Couldn't classify this document" }
       if 'loan_statement':
         extractLoanStatementData(pdfText)  ← new
           → loanExtractionResultSchema (Zod)
         stageLoanExtractionResult()        ← new
           → loan_staging_items (status: 'pending', installmentLoanId: null)
       if 'pm_statement':
         existing extractStatementData + stageExtractionResult path unchanged
           → property_staging_items (renamed from document_staging_items)

Review (new Phase B frontend)
  GET  /api/ingestion/loan-staged
       → sessions of loan_staging_items grouped by sourceDocumentId
  PATCH /api/ingestion/loan-staged/[id]
       → set installmentLoanId + status

Commit (new)
  POST /api/ingestion/loan-commit
       → validate installmentLoanId on all approved items
       → INSERT loan_ledger rows
       → DELETE loan_staging_items
```

---

## Implementation Units

### U0. AI document classification function

**Goal:** Implement `classifyDocument(pdfText)` — a fast AI call that determines document type before extraction routing.

**Requirements:** Users upload without selecting type; extract route needs to determine PM vs loan vs unknown before calling the appropriate extraction function (see Scope and data-model.md Ingestion Domain)

**Dependencies:** None (pure library code)

**Files:**
- `lib/ingestion/extraction/parse.ts` (modify — add `classifyDocument`)
- `lib/ingestion/extraction/schema.ts` (modify — add `classificationResultSchema`)
- `__tests__/lib/ingestion-extraction.test.ts` (modify or create)

**Approach:**

`classificationResultSchema` (Zod):
- `documentType`: enum `pm_statement | loan_statement | unknown`
- `confidence`: enum `high | medium | low`

`classifyDocument(pdfText: string)`: `generateObject` call using `classificationResultSchema`. System prompt: identify whether the document is an Australian property management statement, a mortgage/home loan bank statement, or neither. Return `unknown` when confidence is insufficient — do not guess.

Model: Haiku (fast, cheap — classification is a simpler task than extraction).

**Test scenarios:**
- Returns `pm_statement` for text containing PM statement signals
- Returns `loan_statement` for text containing loan statement signals
- Returns `unknown` for unrecognisable text
- Schema rejects values outside the enum
- System prompt references "property management" and "loan statement"

**Verification:** Unit tests pass; `pnpm tsc --noEmit` passes.

---

### U1. Schema — loan_staging_items table + rename document_staging_items + migrations + RLS

**Decision:** Staging tables are entity-based (mirror the ledger destination, not the source document type). `document_staging_items` is renamed to `property_staging_items`. See `docs/data-model.md` Ingestion Domain. Both staging tables now have explicit names that reflect where they commit to, not where they came from.

**Goal:** Define `loan_staging_items` in `db/schema.ts`, rename `document_staging_items` → `property_staging_items`, generate migrations, and add RLS.

**Requirements:** Entity-based staging tables (see Key Technical Decisions and data-model.md Ingestion Domain)

**Dependencies:** U2 (from schema plan — loan_ledger migration applied)

**Files:**
- `db/schema.ts` (modify — rename `documentStagingItems` → `propertyStagingItems`, add `loanStagingItems`)
- `lib/ingestion/repositories/staging.ts` (modify — update `documentStagingItems`, `DocumentStagingItem`, `NewDocumentStagingItem` imports and references)
- `lib/ingestion/services/ingestion.ts` (modify — update `documentStagingItems` import)
- `drizzle/0019_rename_document_staging_items.sql` (generated — ALTER TABLE rename + rename unique constraint + drop/recreate RLS policy)
- `drizzle/0020_loan_staging_items.sql` (generated — new table + RLS)

**Approach — rename:**

In `db/schema.ts`, rename the Drizzle table definition from `documentStagingItems` / `'document_staging_items'` to `propertyStagingItems` / `'property_staging_items'`. Update all references in `lib/ingestion/repositories/staging.ts` and `lib/ingestion/services/ingestion.ts`. The rename migration must handle three artifacts:

```sql
-- 1. Rename the table
ALTER TABLE "document_staging_items" RENAME TO "property_staging_items";

-- 2. Rename the auto-generated unique constraint (not auto-renamed by Postgres)
ALTER TABLE "property_staging_items"
  RENAME CONSTRAINT "document_staging_items_source_document_id_line_item_index_unique"
  TO "property_staging_items_source_document_id_line_item_index_unique";

-- 3. Rename the RLS policy (no ALTER POLICY RENAME in Postgres — must drop + recreate)
DROP POLICY "users manage own document_staging_items" ON "property_staging_items";
CREATE POLICY "users manage own property_staging_items"
  ON "property_staging_items" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

FK and CHECK constraints (`dsi_source_doc_fk`, `dsi_property_fk`, `dsi_installment_loan_fk`, `dsi_confidence_check`, `dsi_status_check`) use explicit `dsi_*` names that don't embed the table name — no rename needed.

**Approach — loan_staging_items:**

Table columns: `id` (uuid PK), `userId` (uuid NOT NULL), `sourceDocumentId` (uuid NOT NULL), `lineItemIndex` (integer NOT NULL), `paymentDate` (date NOT NULL), `amountCents` (integer NOT NULL), `interestCents` (integer nullable), `principalCents` (integer nullable), `description` (text nullable), `confidence` (text NOT NULL, check constraint high|medium|low), `installmentLoanId` (uuid nullable), `status` (text NOT NULL default 'pending', check constraint pending|approved|rejected), `createdAt` (timestamp), `updatedAt` (timestamp with tz)

Use `foreignKey()` builder with explicit names:
- `lsi_source_doc_fk`: `sourceDocumentId → source_documents.id`, ON DELETE CASCADE
- `lsi_installment_loan_fk`: `installmentLoanId → installment_loans.id`, ON DELETE SET NULL

Indexes: `unique(sourceDocumentId, lineItemIndex)`, `index('idx_loan_staging_user').on(t.userId)`, `index('idx_loan_staging_loan').on(t.installmentLoanId)`

Manually append RLS to migration:
```sql
CREATE POLICY "users manage own loan_staging_items"
  ON "loan_staging_items" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Type exports: `PropertyStagingItem`, `NewPropertyStagingItem`, `LoanStagingItem`, `NewLoanStagingItem`

**Patterns to follow:** `db/schema.ts` — `documentStagingItems` for the overall shape and `foreignKey()` builder usage; `drizzle/0014_property_tenancies.sql` for RLS template.

**Test expectation:** None — `pnpm tsc --noEmit` and `pnpm db:migrate` verify.

**Verification:** Both migrations apply; type exports compile without errors; existing `document_staging_items` references updated throughout codebase.

---

### U2. Extraction layer — loan statement schema + parse function

**Goal:** Define the Zod schema for loan statement extraction results and implement the AI extraction function.

**Requirements:** Extraction of payment date, amount, interest component, principal component, closing balance (see origin)

**Dependencies:** None (pure library code)

**Files:**
- `lib/ingestion/extraction/schema.ts` (modify — add `loanExtractionResultSchema`)
- `lib/ingestion/extraction/parse.ts` (modify — add `extractLoanStatementData`)
- `__tests__/lib/ingestion-extraction.test.ts` (modify or create)

**Approach:**

`loanExtractionResultSchema` (Zod):
- `lenderName`: string
- `accountNumber`: string (optional)
- `statementPeriodStart`, `statementPeriodEnd`: string matching date regex (`YYYY-MM-DD`)
- `closingBalanceCents`: integer
- `payments`: array (min 0) of objects with:
  - `paymentDate`: date string (required)
  - `amountCents`: positive integer (required) — total payment amount
  - `interestCents`: nonnegative integer (optional)
  - `principalCents`: nonnegative integer (optional)
  - `description`: string max 500 (optional)
  - `confidence`: enum high|medium|low

`extractLoanStatementData(pdfText: string)`: `generateObject` call using `loanExtractionResultSchema`. System prompt should instruct: extract every payment in the statement period; `amountCents` is the total payment (always positive); extract the interest/principal split when visible; `closingBalanceCents` is the end-of-statement balance; all dates in `YYYY-MM-DD` format; an empty `payments` array is valid for a statement with no transactions.

**Patterns to follow:** `lib/ingestion/extraction/schema.ts` — `extractionResultSchema` and `DATE_REGEX`; `lib/ingestion/extraction/parse.ts` — `extractStatementData` using `generateObject`.

**Test scenarios:**
- `extractLoanStatementData` with mocked `generateObject` returning valid object → returns typed `LoanExtractionResult`
- Schema rejects missing required `paymentDate` on a payment entry
- Schema rejects negative `amountCents`
- Schema accepts empty `payments` array (valid for statements with no transactions in the period)
- Schema accepts payments without `interestCents` / `principalCents` (they are optional)
- System prompt contains references to interest, principal, and closing balance

**Verification:** Unit tests pass; `pnpm tsc --noEmit` passes.

---

### U3. Extract route — classify then branch

**Goal:** Update `app/api/extract/route.ts` to classify the document via AI, update its stored type, then route to the correct extraction path. Also update `app/api/upload/route.ts` to make `documentType` optional.

**Requirements:** Auto-classification (see Scope and Key Technical Decisions); upload flow extended to handle loan statements

**Dependencies:** U0, U1, U2, U4 (classification and staging functions must exist before the route calls them)

**Execution note:** Implement after U4. U3 depends on `stageLoanExtractionResult` from U4 and is listed here for logical grouping — the route wraps the services, so services (U4) must be built first.

**Files:**
- `app/api/upload/route.ts` (modify — make `documentType` optional, default `'unknown'`, use generic storage folder)
- `app/api/extract/route.ts` (modify — add classify step, update source document, branch on result)
- `__tests__/api/extract.test.ts` (modify)

**Approach — upload route:**

Make `documentType` optional in the request body. When absent or `'unknown'`, store as `'unknown'` in `source_documents` and use the generic `documents/<userId>/documents/` storage path. The existing allowed-types validation is relaxed to permit `'unknown'`.

**Approach — extract route:**

After extracting PDF text, before the existing extraction call:
1. Call `classifyDocument(pdfText)` (from `@/lib/ingestion/extraction/parse`)
2. Update `source_documents` SET `documentType = result.documentType` where `id = sourceDocumentId`
3. Branch on `result.documentType`:
   - `'unknown'` → return 422 `{ error: "Couldn't classify this document — only PM statements and loan statements are supported" }`
   - `'loan_statement'` → call `extractLoanStatementData(pdfText)` then `stageLoanExtractionResult(userId, sourceDocumentId, result)`
   - `'pm_statement'` → existing `extractStatementData` + `stageExtractionResult` path unchanged

Response shape is identical for PM and loan: `{ sourceDocumentId, stagedCount }`.

**Patterns to follow:** Existing `app/api/extract/route.ts` — auth, rate-limit, storage download, PDF text extraction, and error handling are all shared.

**Test scenarios:**
- POST → AI classifies as `loan_statement` → calls loan extraction path; returns `{ sourceDocumentId, stagedCount }`
- POST → AI classifies as `pm_statement` → calls PM extraction path (regression)
- POST → AI classifies as `unknown` → returns 422 with clear error message; no staging rows created
- `source_documents.documentType` is updated to the classified type after the classify call
- Rate limit applies to all paths
- 401 when unauthenticated
- 404 when `sourceDocumentId` not found or belongs to another user

**Verification:** Unit tests pass.

---

### U4. Ingestion service — loan staging function

**Goal:** Implement `stageLoanExtractionResult` to persist loan extraction output to `loan_staging_items`.

**Requirements:** Staged entries land in `loan_staging_items` with `status: 'pending'` and `installmentLoanId: null`

**Dependencies:** U1, U2

**Files:**
- `lib/ingestion/services/loan-ingestion.ts` (create)
- `lib/ingestion/index.ts` (export `stageLoanExtractionResult`)
- `__tests__/lib/loan-ingestion-service.test.ts` (create)

**Approach:**

New file `lib/ingestion/services/loan-ingestion.ts` (separate from the existing PM service file — keeps domains clean):

`stageLoanExtractionResult(userId, sourceDocumentId, result)`:
1. Update `source_documents.periodStart` and `periodEnd` from `result.statementPeriodStart/End`
2. Insert each payment in `result.payments` as a `loan_staging_items` row (`lineItemIndex` = array index, `installmentLoanId: null`, `status: 'pending'`)
3. Return count of rows inserted

**Patterns to follow:** `lib/ingestion/services/ingestion.ts` — `stageExtractionResult` for the source document period update and bulk insert pattern.

**Test scenarios:**
- Stages all payments; returned count equals `result.payments.length`
- Updates `source_documents.periodStart/End` from the result
- Empty `payments` array → stages 0 items but still updates period dates
- Duplicate `(sourceDocumentId, lineItemIndex)` → unique constraint error propagates (not swallowed)

**Verification:** Unit tests pass.

---

### U5. Ingestion service — loan commit function

**Goal:** Implement `commitLoanStagedItems` to write approved `loan_staging_items` to `loan_ledger` and clean up staging rows.

**Requirements:** Confirmed staging entries written to `loan_ledger` (see origin)

**Dependencies:** U1, U4

**Files:**
- `lib/ingestion/services/loan-ingestion.ts` (modify — add `commitLoanStagedItems`)
- `lib/ingestion/index.ts` (export)
- `__tests__/lib/loan-ingestion-service.test.ts` (modify)

**Approach:**

`commitLoanStagedItems(userId, sourceDocumentIds)`:
1. Validate all `sourceDocumentIds` belong to the authenticated user
2. Fetch all `loan_staging_items` with `status = 'approved'` for those source docs (scoped by `userId`)
3. Validate every approved item has a non-null `installmentLoanId` — return an error if any are unmatched
4. In a transaction:
   a. Insert `loan_ledger` rows from approved staging items: `userId`, `installmentLoanId`, `paymentDate`, `amountCents`, `interestCents`, `principalCents`, `description`, `sourceDocumentId`
   b. Hard-delete all `loan_staging_items` for those source docs (approved and rejected)
5. Return count of `loan_ledger` rows created

Note: unlike PM commits, loan commits do not soft-delete prior `loan_ledger` rows for the source doc — `loan_ledger` is append-only. Duplicate detection (same payment date + amount for same loan) is deferred.

**Patterns to follow:** `lib/ingestion/services/ingestion.ts` — `commitStagedItems` for the transaction pattern and user ownership validation.

**Test scenarios:**
- Commits all approved items to `loan_ledger`; staging items (approved + rejected) are hard-deleted
- Items with `status: 'rejected'` are deleted but not committed
- Commit fails with a clear error if any approved item has null `installmentLoanId` — nothing committed
- Source document belonging to another user → ownership error; nothing committed
- Transaction rollback: if `loan_ledger` insert fails, staging items are not deleted
- Returned count equals number of approved items

**Verification:** Unit tests pass; integration test in U7 covers the end-to-end.

---

### U6. API routes — loan staging

**Goal:** Expose GET, PATCH, and POST endpoints for the loan staging and commit workflow.

**Requirements:** Frontend needs to list sessions, update item matching, and commit (see origin — upload extension section)

**Dependencies:** U4, U5

**Files:**
- `app/api/ingestion/loan-staged/route.ts` (create — GET)
- `app/api/ingestion/loan-staged/[id]/route.ts` (create — PATCH)
- `app/api/ingestion/loan-commit/route.ts` (create — POST)
- `__tests__/api/loan-staged.test.ts` (create)
- `__tests__/api/loan-commit.test.ts` (create)

**Approach:**

`GET /api/ingestion/loan-staged` — load `loan_staging_items` for the authenticated user, joined with `source_documents` for filename, grouped by `sourceDocumentId`. Response: `{ sessions: [{ sourceDocumentId, documentFileName, items: [...] }] }`.

`PATCH /api/ingestion/loan-staged/[id]` — accept `{ installmentLoanId?: string | null, status?: 'pending' | 'approved' | 'rejected' }`. Validate ownership (staging item's `userId === caller`). Update the item. Response: `{ item: {...} }`.

`POST /api/ingestion/loan-commit` — accept `{ sourceDocumentIds: string[] }`. Call `commitLoanStagedItems`. Response: `{ committed: number }`.

**Patterns to follow:** `app/api/ingestion/staged/route.ts` and `app/api/ingestion/commit/route.ts` — auth pattern, response shapes, error handling.

**Test scenarios:**

GET:
- Returns sessions for the authenticated user
- Does not return sessions belonging to other users
- Returns empty array when no staging items exist
- 401 when unauthenticated

PATCH:
- Sets `installmentLoanId` on a staging item → 200 with updated item
- Sets `status: 'approved'` → 200
- Staging item belonging to another user → 404 (ownership enforced)
- Invalid UUID format for `installmentLoanId` → 400
- 401 when unauthenticated

POST:
- Commits approved items; returns `{ committed: N }`
- Returns error if any approved item lacks `installmentLoanId`
- Empty `sourceDocumentIds` array → 400
- Source document belonging to another user → error
- 401 when unauthenticated

**Verification:** Unit tests pass; `pnpm tsc --noEmit` passes.

---

### U7. Integration tests — backend pipeline

**Goal:** Write integration tests for soft-delete correctness, cross-parent scoping, and end-to-end staging flow.

**Requirements:** `docs/testing-strategy.md §2` — soft-delete WHERE clause must be verified with an integration test; `docs/solutions/logic-errors/service-where-clause-missing-property-scope-2026-05-20.md` — cross-parent scope must be tested

**Dependencies:** U5, U6

**Files:**
- `__tests__/api/loan-ledger.integration.test.ts` (create)
- `__tests__/api/loan-staging.integration.test.ts` (create)

**Approach:**

`loan_ledger` soft-delete test:
1. Insert a `loan_ledger` row
2. Soft-delete it (set `deleted_at = now()`)
3. Assert that a query using `isNull(loanLedger.deletedAt)` does not return the row

Cross-parent scope test (per learnings doc — scoping service mutations):
- Insert a `loan_staging_items` row for loan A
- Attempt commit via `commitLoanStagedItems` using a source document that belongs to a different loan (loan B) in the WHERE clause
- Assert 0 rows written to `loan_ledger`

End-to-end staging flow:
- Insert a `source_documents` row with `documentType: 'loan_statement'`
- Call `stageLoanExtractionResult` with a mock extraction result
- Assert `loan_staging_items` rows created with correct field values
- PATCH staging items to set `installmentLoanId` and `status: 'approved'`
- Call `commitLoanStagedItems`
- Assert `loan_ledger` rows exist with correct values
- Assert `loan_staging_items` rows are deleted

**Patterns to follow:** `__tests__/api/documents.integration.test.ts` — soft-delete integration test pattern; `__tests__/api/upload.integration.test.ts` — auth setup and `if (!hasEnv) return` guard.

**Verification:** `pnpm test:integration` passes with Supabase running.

---

### U8. Upload page — loan list loading + matching state

**Goal:** Load available installment loans in the upload page and add state to support loan-based session matching.

**Requirements:** Upload wizard can match a loan statement to an installment loan (see origin — staging and matching section)

**Dependencies:** U6 (loan staged routes must exist)

**Files:**
- `app/(app)/upload/page.tsx` (modify)

**Approach:**

Remove the document type selector:
- Delete the `DOCUMENT_TYPE_OPTIONS` constant, the `documentType` state, and the 3-button type selector UI
- Remove `formData.append('documentType', documentType)` from `processFile`; `documentType` is no longer sent in the upload request
- Handle 422 responses from `/api/extract`: update file status to `'error'` with the message from the response body (e.g. "Couldn't classify this document…")

Add loan session support:
- Fetch installment loans for the matching step: iterate `GET /api/properties` → for each property `GET /api/properties/{id}/loans` (same pattern used elsewhere in the app). Trigger alongside the property fetch when entering review state.
- Store in `loans: Loan[]` state (type already defined in the page)
- Add `sessionLoanMap: Record<string, string>` state (sourceDocumentId → installmentLoanId)
- The GET loan-staged endpoint returns sessions; add a separate `loanSessions` state loaded from `GET /api/ingestion/loan-staged`. The existing `stagedSessions` from `GET /api/ingestion/staged` continues to drive PM sessions.

**Patterns to follow:** `app/(app)/upload/page.tsx` — `mortgagePropertyId`/`mortgageLoans` cascading fetch pattern; existing `loadStaged` / `setStagedSessions` pattern.

**Test expectation:** None — UI behavior; Playwright e2e covers the golden path if written.

**Verification:** Upload page renders without errors; loan list loads in review state.

---

### U9. Upload page — loan statement review UI

**Goal:** Implement the loan session matching and entry review UI within the upload wizard.

**Requirements:** User can match a loan statement to an installment loan and approve payment entries before committing (see origin — upload extension, staging and matching)

**Dependencies:** U8

**Files:**
- `app/(app)/upload/page.tsx` (modify)

**Approach:**

For `loanSessions`, render a review section distinct from PM sessions:
- **Matching step**: dropdown to select an `installmentLoan` from the loaded `loans` list. On selection, PATCH each item in the session to set `installmentLoanId` via `PATCH /api/ingestion/loan-staged/[id]`.
- **Entry review**: table showing payment entries — Date · Amount · Interest · Principal columns (no category dropdown, no property dropdown). Amount shown formatted; Interest/Principal shown in muted text or "—" when not recorded.
- **Approve/reject**: per-item status toggle or bulk "Approve all" that PATCHes each item's `status`.

The existing PM session review UI (property matching + category columns) is rendered only for PM/bank statement sessions — no changes to that section.

**Patterns to follow:** `app/(app)/upload/page.tsx` — `handleAssignProperty` / PM session rendering pattern to mirror.

**Test expectation:** None — UI behavior.

**Verification:** Loan sessions render correctly; matching updates staging item `installmentLoanId`.

---

### U10. Upload page — loan commit flow

**Goal:** Wire the commit action for loan staging sessions to `POST /api/ingestion/loan-commit`.

**Requirements:** User can confirm loan staging items and write them to `loan_ledger` (see origin — upload extension, confirm step)

**Dependencies:** U9

**Files:**
- `app/(app)/upload/page.tsx` (modify)

**Approach:**

Add a "Confirm loan payments" action for matched and approved loan sessions:
- Collect `sourceDocumentIds` from `loanSessions` where all items have `installmentLoanId` set
- Call `POST /api/ingestion/loan-commit`
- On success: clear committed sessions from UI state; show toast with committed count (e.g. "12 payments recorded")
- On error: show toast with error message; leave sessions in place for retry

Keep the existing "Confirm entries" PM commit flow completely unchanged.

**Patterns to follow:** `app/(app)/upload/page.tsx` — existing `handleCommit` PM commit flow.

**Test expectation:** None — UI behavior.

**Verification:** Commit button calls correct endpoint; committed count shown in success toast; sessions removed from UI.

---

## System-Wide Impact

**Phase A (backend):**
- New `loan_staging_items` table — no existing code affected
- `app/api/extract/route.ts` gains a branch — PM extraction path unchanged
- `lib/ingestion/` gains `loan-ingestion.ts` — PM ingestion service file untouched
- New `app/api/ingestion/loan-staged/` and `loan-commit/` routes — no naming conflicts with existing ingestion routes
- `loan_ledger` now populated via the upload path — `property_ledger.loan_payment` entries remain unaffected

**Phase B (frontend):**
- `app/(app)/upload/page.tsx` — loan session review UI is additive; PM review UI rendered only for PM sessions; no behavioral change for existing PM statement upload flow
- Golden path regression check: upload a PM statement end-to-end and verify it still works (matching, review, commit to `property_ledger`)

---

## Deferred Implementation Notes

- **Drizzle `sql` template column qualification:** If any query in this work uses a correlated subquery inside a Drizzle `sql<>` template (e.g. to fetch latest loan balance inline), outer-row column references must use raw fully-qualified text `"table_name"."db_column_name"` — not `${table.column}`. See `docs/solutions/logic-errors/drizzle-sql-template-unqualified-column-refs-2026-05-21.md`. Unit tests will not catch this; only integration tests that assert a non-null value will.
- **Duplicate payment detection:** Two `loan_ledger` rows with the same `(installmentLoanId, paymentDate, amountCents)` can be created by uploading the same statement twice. Detection / deduplication deferred.
- **Extract retry after partial staging failure:** If `/api/extract` succeeds at classification + document type update but fails mid-staging (some `loan_staging_items` rows already inserted), a retry on the same `sourceDocumentId` will hit the unique constraint on `(sourceDocumentId, lineItemIndex)`. This is consistent with the existing PM staging behavior (same gap). The `source_documents.file_hash` unique constraint prevents a second source document row from the same file — it does not prevent re-extraction on an existing `sourceDocumentId`. Resolution if needed: delete existing staging rows for the source document before re-staging, or use `onConflictDoNothing` — deferred.

---

## Success Criteria

**Phase A:**
- [ ] `pnpm test` passes
- [ ] `pnpm test:integration` passes (Supabase running)
- [ ] `pnpm tsc --noEmit` passes
- [ ] `document_staging_items` renamed to `property_staging_items`; all references updated
- [ ] `loan_staging_items` table exists with explicit FK names
- [ ] POST `/api/extract` with an untyped PDF classifies it via AI, updates `source_documents.documentType`
- [ ] POST `/api/extract` with an unclassifiable PDF returns 422 with clear error; no staging rows created
- [ ] POST `/api/extract` with a loan statement creates `loan_staging_items` rows
- [ ] POST `/api/ingestion/loan-commit` writes rows to `loan_ledger` and deletes staging items
- [ ] PM statement upload flow unchanged

**Phase B:**
- [ ] Upload page has no document type selector
- [ ] Unclassifiable PDF shows "Couldn't classify" error in file status list
- [ ] Upload wizard renders loan sessions with payment columns (date, amount, interest, principal)
- [ ] Loan session can be matched to an installment loan via dropdown
- [ ] Commit writes entries to `loan_ledger` (verifiable in Supabase Studio)
- [ ] PM statement upload flow unchanged (end-to-end regression check)
