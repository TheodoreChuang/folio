---
title: "feat: PM upload management UI (U11–U12 follow-up)"
type: feat
date: 2026-07-03
origin: docs/plans/2026-07-02-001-feat-pm-statement-upload-hardening-plan.md
status: not-started
---

# feat: PM upload management UI — U11 & U12 follow-up

Deferred frontend slice from the PM-statement upload hardening work. The backend
(U1–U9) and the review-screen frontend (U10) shipped; this covers the post-confirmation
and management surfaces, which have **no automated test gate** and need interactive
browser verification (real uploads require the AI extraction pipeline + an authed session).

## Already in place (built and verified in the parent work)

Every API these units need already exists and is tested:

- `GET /api/v1/documents/[id]` → `{ document, activeTransactionCount }` (void dialog count).
- `DELETE /api/v1/documents/[id]` → status-aware: `confirmed`→voided, `pending`→dismissed;
  returns `{ deleted, outcome, entriesDeleted }`.
- `PATCH /api/v1/ledger/[id]` → R9 correction (append-only; returns the new row).
- `DELETE /api/v1/ledger/[id]` → R10 delete (sets `deletionReason='user_deleted'`).
- `POST /api/v1/upload` with `replacesSourceDocumentId` form field → R23 Replace anchor;
  returns `409 { existingUploadId }` on an active duplicate.
- `GET /api/v1/ingestion/staged` sessions carry `previouslyDeleted[]` (R18) already
  rendered on the review screen (U10 `SessionWarnings`).
- `source_documents.periodStart/periodEnd` are persisted at extract time (R24 grouping input).

## U11 — Post-confirmation & management UI

- **R4 void dialog:** on a confirmed upload, fetch `GET /api/v1/documents/[id]` and confirm
  with the upload name/date, the `activeTransactionCount`, and irreversibility, plus Cancel.
- **R10 delete dialog:** in the confirmed-transactions surface (extend the existing table in
  `app/(app)/properties/[id]/page.tsx`, which already deletes via `DELETE /api/v1/ledger/[id]`)
  add the "Re-uploading the source statement may re-import this transaction" copy; keep the
  label distinct from the review-time "Remove from import".
- **R9 correction surface:** inline editor / detail drawer in the same table calling
  `PATCH /api/v1/ledger/[id]`; insights recompute after the new row lands.
- **R12 link target:** a management/detail view for an upload so the U10 duplicate 409 block
  can link to the existing upload (it currently only shows an identifying message).

## U12 — Amendment via Replace + period-grouped uploads view

- **R23 Replace:** on a confirmed upload, a "Replace with corrected version" action that runs
  the R4 void confirmation, voids the original, then opens the file picker and uploads with
  `replacesSourceDocumentId` set to the voided upload's id. The resulting review shows the R18
  previously-deleted warning (already wired via the staged session) even across a changed hash.
  Guidance copy: for a single wrong line, point the user to the R9 inline correction, not Replace.
- **R24 period-grouped uploads view:** group uploads by property × period using
  `periodStart/periodEnd`; flag when two *active* uploads cover the same property × period.

## Scope note

The natural home for the management/uploads-list view does not exist yet — it is net-new UI
(the parent work only had the upload/review screen). Decide during build whether it lives as a
new route (e.g. `app/(app)/uploads/`) or a section on the upload page. Verify each surface with
`pnpm dev` + browser before marking done — tsc/lint is not the gate here.
