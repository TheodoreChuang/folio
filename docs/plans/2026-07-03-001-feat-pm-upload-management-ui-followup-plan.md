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

## Current state & handoff (2026-07-03)

**Shipped as 3 stacked PRs (merge in order 118 → 119 → 120):**
- **#118** `feat/pm-upload-1-schema` → `main`: U1 schema/migration (`0031_pm_upload_hardening.sql`) **+ the `db:generate` fix** (`drizzle/meta/0031_snapshot.json`). `db:generate` is verified working again (clean no-op; a throwaway column yields a single-line ALTER). Intermediate snapshots 0007–0030 remain absent — harmless to generate, optional cleanup.
- **#119** `feat/pm-upload-2-backend` → #118: U2–U9. 1078 unit + 148 integration tests green against the local DB. Two bugs found by running integration for real and fixed: storage bucket has no UPDATE RLS policy (KTD-3 retry is now **remove-then-reinsert**, not `upsert:true`); Drizzle wraps errors so the pg code is on `.cause.code` (upload race branch reads both levels).
- **#120** `feat/pm-upload-3-frontend` → #119: U10 review screen + this plan. Browser-smoke-tested (magic-link login as `dev-owner@folio.test`, seeded session): editable fields, catch-all ⚠, "Remove from import", net `+$3,970` proving the `other_income` sign fix, "Confirm 3 transactions", no console errors.

**Base U11/U12 on `feat/pm-upload-3-frontend`** (has U10 + all backend). Once the 3 PRs merge, base on `main`.

**Environment / gotchas for the next session:**
- Local `dev-owner@folio.test` data was wiped by a `pnpm db:reset` during U1 verification (my error). The test user itself still exists (recreated via admin API; password in `.env.local` `TEST_USER_PASSWORD`). `pnpm db:seed` rebuilds the canonical dev dataset (3 properties, loans, March-2026 ledger with intentional gaps) — **offered, not yet run; awaiting user decision.**
- Integration tests need the test user to exist locally. Run scoped + excluding the stale worktree: `pnpm test:integration -- --exclude '**/.claude/**' <file>`. There's a leftover `.claude/worktrees/fix/assistant-error-feedback` tree that the integration config scans (noise, not failures).
- The app is **passwordless (magic-link)**. To smoke-test authed pages: request a link in the browser, then fetch it from Mailpit (`http://127.0.0.1:54324`, API `/api/v1/messages` → `/api/v1/message/{id}`), navigate the `verify?token=…` URL in the **same** browser (PKCE verifier cookie must match).
- Drizzle `db:generate` now works — see the `project-drizzle-snapshot-drift` memory if it ever regresses (regenerate the latest snapshot).

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
