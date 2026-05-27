---
title: Loan Upload Extension — Auto-Classifying Upload
date: 2026-05-26
status: active
plan: docs/plans/2026-05-22-002-feat-loan-upload-extension-plan.md
---

# Requirements: Loan Upload Extension with Auto-Classification

## Problem

The upload page requires users to select a document type (PM statement / bank statement / loan statement) before dropping files. This is friction the design never intended — `docs/visual-designs/upload.html` shows "Folio classifies it, matches it to a property" and a "No property selection needed" chip. The selector is also error-prone: a user who selects the wrong type gets silently wrong extraction output.

The existing plan (`docs/plans/2026-05-22-002-feat-loan-upload-extension-plan.md`) was written assuming user-selected type. This document amends that scope to add auto-classification.

---

## Goal

Users drop one or more PDFs. The system determines document type automatically. No type selector. The upload page surfaces a clear error for documents it cannot classify.

---

## Scope

### In scope

- Remove the 3-button document type selector from the upload page
- New `classifyDocument(pdfText)` AI function that returns `pm_statement | loan_statement | unknown`
- Extract route: call `classifyDocument` first, update `source_documents.documentType`, then route to the appropriate extraction function
- Upload route: `documentType` becomes optional (defaults to `'unknown'`); files stored in a generic folder path when type is unknown at upload time
- When classification returns `unknown`: return a 422-class error from the extract route; upload page shows "Couldn't classify this document" in the file status list — no staging rows created
- Unit tests for `classifyDocument` (mocked AI) and for the classify→branch logic in the extract route

### Out of scope (unchanged from existing plan)

- `loan_staging_items` schema (U1)
- Loan extraction schema and `extractLoanStatementData` (U2)
- Staging and commit services (U4, U5)
- Loan staged API routes (U6)
- Integration tests (U7)
- Loan review UI — matching, entry review, commit flow (U9, U10)

### Deferred

- Auto-matching a loan statement to a specific installment loan by lender name / account number (already deferred in original plan)
- Classification confidence threshold / partial-confidence fallback
- Support for council rates notices, water notices, or other document types

---

## Behaviour

### Happy path — PM statement

1. User drops `march-statement.pdf` (no type selection)
2. Upload: stored at `documents/<userId>/documents/march-statement.pdf`, `documentType = 'unknown'`
3. Extract: `classifyDocument()` returns `pm_statement` → `source_documents.documentType` updated → `extractStatementData()` called → `stageExtractionResult()` called
4. Upload page: file status shows "Staged", session appears in review

### Happy path — loan statement

1. User drops `cba-loan-statement.pdf`
2. Upload: stored at `documents/<userId>/documents/cba-loan-statement.pdf`, `documentType = 'unknown'`
3. Extract: `classifyDocument()` returns `loan_statement` → `source_documents.documentType` updated → `extractLoanStatementData()` called → `stageLoanExtractionResult()` called
4. Upload page: file status shows "Staged", loan session appears in review

### Error path — unclassifiable

1. User drops `council-rates.pdf`
2. Upload: succeeds, stored in generic folder
3. Extract: `classifyDocument()` returns `unknown` → route returns 422 with `{ error: "Couldn't classify this document — only PM statements and loan statements are supported" }`
4. Upload page: file status shows "Error" with the message

### Multiple files

User can drop a PM statement and a loan statement simultaneously. Each is processed independently — they do not need to be the same type.

---

## Classification function

`classifyDocument(pdfText: string): Promise<{ documentType: 'pm_statement' | 'loan_statement' | 'unknown' }>`

- Uses a fast model (Haiku)
- System prompt: identify whether the document is an Australian property management statement, a mortgage/home loan bank statement, or neither
- Returns `unknown` when confidence is insufficient — does not guess
- Separate from extraction; called once before extraction in the extract route
- Not the same call that does extraction (two AI calls per document is intentional and acceptable)

---

## Changes to existing plan (amendment summary)

| Unit | Change |
|------|--------|
| New U0 | Add `classifyDocument()` + classification schema in `lib/ingestion/extraction/` |
| U2 (extraction) | `classifyDocument` lives alongside `extractStatementData` / `extractLoanStatementData` in `parse.ts` |
| U3 (extract route) | Classify first, update `source_documents.documentType`, then branch on result. Return 422 on `unknown`. |
| Upload route | Make `documentType` optional. If absent/unknown, use generic storage folder. |
| Upload page | Remove 3-button type selector. Remove `documentType` state. `processFile` no longer appends `documentType` to form data. Handle 422 "unclassifiable" error in file status. |

The rest of the plan (U1, U4–U7, U9–U10) is unchanged.

---

## Success criteria

- [ ] Upload page has no document type selector
- [ ] PM statement dropped → correctly classified and staged (existing flow unbroken)
- [ ] Loan statement dropped → classified as `loan_statement`, staged in `loan_staging_items`
- [ ] Unclassifiable PDF → file status shows clear error, no staging rows created
- [ ] `pnpm test` passes (unit tests for classify path)
- [ ] `pnpm tsc --noEmit` passes
