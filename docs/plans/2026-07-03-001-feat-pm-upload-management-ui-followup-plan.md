---
title: "feat: PM upload management UI (U11–U12 follow-up)"
type: feat
date: 2026-07-04
origin: docs/plans/2026-07-02-001-feat-pm-statement-upload-hardening-plan.md
status: not-started
---

# feat: PM upload management UI — U11 & U12 follow-up

Deferred frontend slice from the PM-statement upload hardening work. The backend
(U1–U9) and the review-screen frontend (U10) shipped; this plan covers the
post-confirmation and amendment/management surfaces. Confirmed with the user
(2026-07-04): **U11 is fully unbuilt** — the "just completed" note in the prior
handoff was imprecise. Both units are planned fresh below, incorporating drift
found by re-reading the current codebase.

---

## Current state (verified 2026-07-04)

**Shipped as 3 stacked PRs (merged in order 118 → 119 → 120), all on `main`:**
- **#118** U1 schema/migration — lifecycle `status` enum, deletion provenance, partial hash index.
- **#119** U2–U9 backend — dedup, void/dismiss, correction, R18 lookup. 1078 unit + 148 integration tests green.
- **#120** U10 review screen + the original (terse) U11/U12 follow-up notes this plan supersedes.

**Backend for U11/U12 already exists and was re-verified directly against source, not assumed from the prior plan:**
- `GET /api/v1/documents/[id]` → `{ document, activeTransactionCount }` (`app/api/v1/documents/[id]/route.ts`).
- `DELETE /api/v1/documents/[id]` → status-aware void/dismiss, returns `{ deleted, outcome, entriesDeleted }` (same file).
- `PATCH /api/v1/ledger/[id]` → R9 correction (soft-delete original + insert, `supersededByEntryId`), returns `{ entry }` (`app/api/v1/ledger/[id]/route.ts`).
- `DELETE /api/v1/ledger/[id]` → R10 delete, sets `deletionReason='user_deleted'`, **no source-document guard** (the old 403 was removed in U7).
- `POST /api/v1/upload` accepts `replacesSourceDocumentId` → R23 Replace anchor; `409 { existingUploadId }` on active duplicate.
- `source_documents.periodStart/periodEnd/status/replacesSourceDocumentId` all present (`db/schema.ts:76-102`).

**Frontend drift found (not in the prior plan) — these change how U11 should be built:**
- `app/(app)/properties/[id]/page.tsx:1528-1540` — the ledger row action menu explicitly **disables delete for PM-imported entries**: `{!entry.sourceDocumentId && <DropdownMenuItem onClick={handleDeleteEntry}>Delete</DropdownMenuItem>}` / `{entry.sourceDocumentId && <DropdownMenuItem disabled>Imported — cannot delete</DropdownMenuItem>}`. This is stale UI matching the *pre-U7* backend guard, which U7 already removed. U11 must remove this gate, not add a new one.
- `handleDeleteEntry` (same file, ~line 647) uses a raw `window.confirm('Delete this transaction?')`. The same page already has a proper dialog pattern for exactly this kind of action (`showDeleteModal` / `showSoldModal`, `components/ui/dialog.tsx`) — U11 should follow that, not the `confirm()` shortcut, and it needs to carry the R10 re-import copy specifically when `entry.sourceDocumentId` is set.
- No correction/edit UI exists for **any** ledger entry today (manual or imported) — R9 is genuinely new UI. The reference pattern is the inline click-to-edit rows already on the same page for property fields (`PropFieldRow` / `PropSelectRow`, lines ~132–260): click a value, edit inline, commit on blur/Enter, cancel on Escape.
- No page shows a single confirmed upload today. R4 (void) and R12 (409 link target) both need somewhere to point to — see KTD-9 below.
- `listDocumentsForDateRange` (`lib/ingestion/repositories/documents.ts:113`) inner-joins `property_ledger` and requires a `month` bound (`app/api/v1/documents/route.ts`). A voided/dismissed upload with no remaining active ledger rows would **not** appear through this query. U12's period-grouped view needs a genuinely new query — see KTD-10.

---

## Delivery Sequencing: two PRs, not one

**Decision: ship U11 and U12 as separate, sequential PRs — U11 first, U12 based on U11.**

Rationale, weighed against the risk the user asked to consider:
- Frontend has no automated test gate (`docs/testing-strategy.md`) — every PR here is verified by manual browser testing only. A smaller PR keeps the manual-verification surface (and the blast radius of a missed regression) tight and attributable to one change.
- U11 touches a **live, currently-shipped code path** — removing the "Imported — cannot delete" gate changes behavior for every PM-imported transaction on the properties page, the app's most-used surface. U12 is almost entirely additive (a new route, a new action) and structurally depends on U11's upload-detail view.
- The seam is clean: U12's only dependency on U11 is the upload-detail view (as a mount point for "Replace" and as the page the list view links into). U11 can ship a coherent, complete post-confirmation experience (void, delete, correct, minimal detail view) without U12 existing. Nothing in U12 forces a rework of U11's shape.
- This mirrors how U2–U9 (8 units, 1 PR) vs. U1 and U10 (1 unit each) already shipped in this project — group when tightly coupled and low-risk, split when one side touches live behavior and the other is additive.

---

## Key Technical Decisions

- **KTD-9. The single-upload detail view is the void trigger, reachable two ways.** `app/(app)/uploads/[id]/page.tsx` (new route) shows one upload's file name, date, status, and linked-transaction count via `GET /api/v1/documents/[id]`, and hosts the R4 void dialog. It is reachable via (a) the existing R12 409-duplicate-block message (already designed to carry an id) and (b) a new small "View source upload" link added to PM-imported ledger rows in the properties table. Until U12 ships the list view, this page has no index — that's expected; U11 does not need to make it globally browsable, only reachable from the two entry points above.
- **KTD-10. R24 needs a new repository query, not a reuse of `listDocumentsForDateRange`.** That function inner-joins `property_ledger` and is `month`-bounded — a voided/dismissed upload with no remaining active ledger rows is invisible to it, and the origin plan's "no new endpoints" note for U12 undercounts this. U12 adds a new query (e.g. `listDocumentsForProperty` in `lib/ingestion/repositories/documents.ts`) selecting directly from `source_documents` by `userId` (+ optional `propertyId`), independent of ledger join, returning `status`, `periodStart`, `periodEnd`, `fileName`, `replacesSourceDocumentId`. Spec-first (conventions §5): extend `lib/openapi/spec.ts` for the new `GET /api/v1/documents` shape before implementing.
- **KTD-11. The correction UI reuses the existing inline-edit pattern, adapted to a table row.** `PropFieldRow`/`PropSelectRow` (click value → inline input/select → commit on blur/Enter, cancel on Escape) are the established pattern on this exact page for property-level fields. U11 adapts the same interaction model per-cell in the transactions table rather than inventing a drawer/modal editor — keeps the correction surface consistent with the rest of the page.

---

## U11 — Post-confirmation management UI

- **Goal:** R4 void dialog, R9 correction, R10 delete (reconciling the existing disabled-for-imported gate and raw `confirm()`), R12 link target.
- **Requirements:** R4, R9, R10, R12 (origin: `docs/plans/2026-07-02-001-feat-pm-statement-upload-hardening-plan.md`).
- **Dependencies:** none beyond already-shipped U1–U9.
- **Files:**
  - `app/(app)/uploads/[id]/page.tsx` (new) — single-upload detail view; void dialog.
  - `app/(app)/properties/[id]/page.tsx` — remove the imported-entry delete gate; replace `handleDeleteEntry`'s `confirm()` with a `Dialog`; add inline correction (amount/date/description/category) per row; add a "View source upload" link on imported rows.
  - `app/(app)/upload/page.tsx` — update the R12 409-duplicate-block message to link to `/uploads/[id]` using `existingUploadId`.
- **Approach:**
  - **Void dialog (R4):** on `/uploads/[id]`, fetch `GET /api/v1/documents/[id]`; dialog states the file name/date, `activeTransactionCount`, and irreversibility, with Cancel; on confirm calls `DELETE /api/v1/documents/[id]`.
  - **Delete dialog (R10):** replace `handleDeleteEntry`'s `confirm()` with a `Dialog` (follow `showDeleteModal`); commit calls `DELETE /api/v1/ledger/[id]`; remove the `!entry.sourceDocumentId` gate on the menu item entirely — both manual and imported entries become deletable through the same path; when `entry.sourceDocumentId` is set, the dialog body adds "Re-uploading the source statement may re-import this transaction." Label stays "Delete transaction" — distinct from the review-time "Remove from import" on the upload page. Add a one-line note beside the delete/correct actions on imported rows: "For a single wrong value, correct it instead of deleting the whole transaction" — steers users toward R9 correction over delete/Replace for single-field mistakes (KTD-8 in the origin plan).
  - **Correction surface (R9):** make amount, date, description, and category cells in the transactions table follow the `PropFieldRow`/`PropSelectRow` click-to-edit pattern, with these states made explicit (the pattern was built for a single label/value grid, not a dense multi-column table, so these don't carry over automatically): only one cell across the whole table may be in edit mode at a time (matching the page's existing single `editingField` state model — starting a new edit blurs/commits any other); a saving cell is dimmed/disabled like the existing `fieldSaving` treatment; a failed `PATCH` reverts the cell to its prior display value and shows a toast (per the bulk-PATCH partial-failure learning — refresh server state on every error branch, not just success). Commit calls `PATCH /api/v1/ledger/[id]`; on success the id changes (a new row per the append-only model) — if the corrected `lineItemDate` moves outside the currently-viewed month (the transactions table is fetched scoped by month), remove the row from the visible list rather than splice-replacing it in place, mirroring the existing month guard in `handleAddEntry` (`entry.lineItemDate.slice(0,7) === txMonth`) rather than assuming the returned entry always belongs in the current view. This is new work, not a reuse of an existing pattern: no current mutation handler on this page refetches the trends chart (`GET /api/v1/properties/${id}/trends?months=12`, fetched once on mount) — add an explicit trends refetch after a successful correction so insights reflect the edit.
  - **R12 link target:** `/uploads/[id]` doubles as this; update the upload page's existing 409-handling message to render a link using `existingUploadId` from the response — today that message renders as static text with a tooltip, not a link, so this is a small structural change to the error-display component, not a one-line copy edit.
- **Patterns to follow:** `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter` + `showDeleteModal`/`showSoldModal` state pattern (`app/(app)/properties/[id]/page.tsx:337-345,1830+`); `PropFieldRow`/`PropSelectRow` inline-edit components (same file, lines ~132–260); existing toast + refresh-on-error pattern; the bulk-PATCH partial-failure learning (`docs/solutions/logic-errors/bulk-patch-partial-failure-...`) — refresh server state in every error branch, not just success; `handleAddEntry`'s month-guard check for the row-visibility rule above.
- **Test scenarios:** Test expectation: none (components have no unit coverage — CLAUDE.md). Verify via `pnpm dev` + browser:
  - Void a confirmed upload from `/uploads/[id]` → dialog shows correct name/date/count; confirming removes its ledger rows from the properties page; Cancel leaves everything unchanged.
  - Delete a PM-imported transaction → menu item is now enabled (not "Imported — cannot delete"); dialog shows the re-import warning copy; confirming removes the row.
  - Delete a manual transaction → dialog shown, no re-import copy (regression check — manual entries have no source document).
  - Correct an imported transaction's amount/date/category/description inline → new value persists, old row no longer appears in the active list, insights update.
  - Trigger the 409 duplicate-upload block → the message links to `/uploads/[id]` and the page loads the correct document.
  - Attempt to load `/uploads/[id]` for another user's document id → 404 surfaced, not another user's data (cross-user isolation, mirrors the existing API-level test).
- **Verification:** browser golden-path + the scenarios above; no pre-commit test gate for this unit (frontend-only).

---

## U12 — Amendment via Replace + period-grouped uploads view

- **Goal:** R23 explicit Replace flow; R24 period-grouped uploads list with overlap flagging.
- **Requirements:** R23, R24.
- **Dependencies:** U11 (uses its `/uploads/[id]` view and void dialog).
- **Files:**
  - `app/(app)/uploads/page.tsx` (new) — list view, grouped by property × period; explicit empty state.
  - `app/(app)/uploads/[id]/page.tsx` — add the "Replace with corrected version" action (from U11).
  - `app/api/v1/documents/route.ts` — extend `GET` to support listing without a `month` bound (optionally by `propertyId`), backed by the new repository query (KTD-10).
  - `lib/ingestion/repositories/documents.ts` — add `listDocumentsForProperty` (or equivalent), independent of the `property_ledger` join.
  - `lib/openapi/spec.ts` — document the extended `GET /api/v1/documents` shape (spec-first, conventions §5).
  - `__tests__/api/documents.test.ts` — extend for the new query shape.
- **Approach:**
  - **Replace (R23):** on `/uploads/[id]` for a `confirmed` upload, add "Replace with corrected version" as the primary action (visually distinct from the secondary, destructive-styled Void action — they read as equally weighted today and Replace itself performs a void internally, so the ordering and styling need to visibly disambiguate them). The guidance copy steering single-line fixes to correction (added in U11) is repeated directly beside this action. Sequencing: open the file picker and upload the new file first (`POST /api/v1/upload` with `replacesSourceDocumentId` set to the original's id) — only once that upload succeeds and the file is staged does the flow void the original (`DELETE /api/v1/documents/[id]`). This ordering (upload-before-void, not void-before-upload) means cancelling the file picker or a failed/rejected upload leaves the original untouched rather than stranding it in a voided state with no replacement staged. **Open question, resolve before/during implementation:** this closes the upload-failure window but not a narrower one — if the user stages successfully but abandons the review screen before confirming, the original would already be voided with the replacement still unconfirmed. Fully closing that gap means binding the void to the *commit* step (voiding the original transactionally alongside `commitStagedItems`, U5) rather than to upload success — a small backend change beyond this plan's current scope. Decide during implementation whether that additional tightening is worth it, or whether the upload-success gate above is sufficient given how narrow the abandonment window is in practice.
  - **Period-grouped list (R24):** `GET /api/v1/documents` (extended, no `month`) returns all of a user's `source_documents` with `status`/`periodStart`/`periodEnd`; group client-side by property, then by the statement's `periodStart`/`periodEnd` span (not calendar month — a period is the document's actual date range, which for annual/multi-period statements, R19/R20, does not align to a single month); flag when two rows with `status='confirmed'` (i.e., active) share the same property and an overlapping `periodStart`/`periodEnd` range. When the list is empty (no uploads yet, or everything voided/dismissed), show a short "No uploads yet" message with a link to the upload page, consistent with the existing empty-state pattern for a month with zero transactions on the properties page.
- **Patterns to follow:** the U11 void dialog and `POST /api/v1/upload` call for Replace; existing list/grouping patterns in the app (e.g. month grouping on the upload page, adapted here to period-span grouping) for the property × period grouping; the properties page's empty-state copy for zero transactions.
- **Test scenarios:**
  - Unit (`__tests__/api/documents.test.ts`): `GET /api/v1/documents` without `month` returns all of the caller's documents including voided/dismissed ones; `propertyId` filter narrows correctly and rejects a malformed (non-UUID) value with 400; another user's documents never appear (cross-user isolation).
  - Test expectation for the UI: none (components have no unit coverage — CLAUDE.md). Verify via `pnpm dev` + browser:
    - Replace a confirmed statement → cancelling the file picker or a rejected upload leaves the original `confirmed` and untouched; a successful upload voids the original only after staging succeeds, and the R18 previously-deleted warning appears on the review screen even when the corrected file's hash differs from the original.
    - Two active (`confirmed`) uploads for the same property with overlapping period ranges are visibly flagged in the list; a voided upload sharing the same period is not flagged; a multi-period (annual) document's range is compared correctly against monthly statements it overlaps.
    - An account with no uploads (or all voided/dismissed) shows the empty state, not a blank table.
    - The list view groups uploads by property, then period, and each row links to its `/uploads/[id]` detail view.
- **Verification:** pre-commit hook green for the extended `GET /api/v1/documents` unit test; browser golden-path + edge cases for the UI (frontend has no test gate).

---

## Risks & Dependencies

- **Live-code change (U11).** Removing the "Imported — cannot delete" gate changes real, currently-shipped behavior on the properties page. Mitigate by verifying both the imported and manual delete paths explicitly (test scenarios above) before merging — this is the reason U11 ships alone first.
- **Query-shape change on `GET /api/v1/documents` (U12).** Making `month` optional changes the endpoint's contract; confirmed via a repo-wide grep that no current frontend code calls this endpoint with a `month` param, so making it optional is additive in practice, not a breaking change — re-check this at implementation time in case a caller is added between now and then.
- **Cross-user isolation (U11, U12).** `/uploads/[id]`, the extended `GET /api/v1/documents`, and the Replace flow's `replacesSourceDocumentId` link all take or return ids — each needs `userId` scoping, already established at the API layer (verified in `GET /api/v1/documents/[id]` and `POST /api/v1/upload`); the new list query must carry the same scoping, including UUID-format validation on the new `propertyId` filter param (mirroring the existing `MONTH_REGEX` check on `month`) so a malformed value 400s instead of falling through to the DB layer.
- **Replace void/upload ordering (U12).** See the Open Question inside U12's Replace approach above — upload-before-void closes the common failure window (cancelled picker, rejected upload) but a narrower abandoned-review window remains unless voiding is bound to the commit step.

---

## Sources / Research

- Backend routes re-verified directly: `app/api/v1/documents/[id]/route.ts`, `app/api/v1/ledger/[id]/route.ts`.
- Frontend drift: `app/(app)/properties/[id]/page.tsx` — imported-entry delete gate (~lines 1528–1540), `handleDeleteEntry` `confirm()` (~line 647), `Dialog`/`showDeleteModal` pattern (lines 337–345, 1830+), `PropFieldRow`/`PropSelectRow` inline-edit components (lines ~132–260).
- Backend gap for U12: `lib/ingestion/repositories/documents.ts:113` (`listDocumentsForDateRange`, ledger-joined + month-bounded), `app/api/v1/documents/route.ts` (month-required `GET`).
- Full requirements, KTDs, and acceptance examples for U1–U10 and the original U11/U12 scope: `docs/plans/2026-07-02-001-feat-pm-statement-upload-hardening-plan.md`.
