# Requirements: Loan Domain Buildout

**Date:** 2026-05-22
**Status:** Ready for planning

---

## Overview

This milestone properly builds out the Loan domain. Currently `installment_loans` tracks only lender, nickname, start/end dates, and property security — no rate, no loan type, no IO end date. Loan repayments are not tracked at all. The upload flow only handles PM statements.

This is a multi-PR milestone. Three logical slices:

1. **Schema foundation** — new fields on `installment_loans`, new `loan_ledger` table
2. **Loan detail page** — rebuilt Overview tab, new Repayments tab with manual entry
3. **Upload extension** — loan bank statement parsing → `loan_ledger`

---

## Scope

### In scope

- Add `loan_type`, `io_end_date`, `interest_rate` to `installment_loans`
- Create `loan_ledger` table (loan-side payment event stream)
- Rebuild the Loan detail page: simplified Overview, populated Repayments tab
- Manual repayment entry on the Repayments tab
- Extend upload flow to parse loan bank statements into `loan_ledger`
- Update visual designs before implementation (see Design prompts section)

### Out of scope

- Rate history tracking (rate is a single mutable field, no history table)
- Offset / redraw tracking
- Balance trajectory chart
- IO-to-P&I transition modelling (scenario planning track)
- `loan_property_securities` (cross-collateralisation — future)
- Revolving credit / credit facilities
- Migrating existing `property_ledger.loan_payment` entries — these stay as property cashflow data and are not replaced by `loan_ledger`

---

## Schema changes

### `installment_loans` — new columns

| Column | Type | Notes |
|---|---|---|
| `loan_type` | `text` (enum: `interest_only`, `principal_and_interest`) | nullable for existing rows |
| `io_end_date` | `date` | nullable; only relevant for IO loans |
| `interest_rate` | `numeric(5,2)` | nullable; single mutable field, no history |

`loan_type` and `io_end_date` are the highest-value additions — they drive the IO countdown tile and future planning features.

### New table: `loan_ledger`

Append-only ledger following the `_ledger` suffix convention. Records each loan payment event from the loan's perspective.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | owner |
| `installment_loan_id` | `uuid` FK → `installment_loans` | required |
| `payment_date` | `date` | required |
| `amount_cents` | `integer` | required; total payment amount |
| `interest_cents` | `integer` | nullable; from bank statement or manual |
| `principal_cents` | `integer` | nullable; from bank statement or manual |
| `description` | `text` | nullable |
| `source_document_id` | `uuid` FK → `source_documents` | nullable; set on statement upload |
| `deleted_at` | `timestamptz` | soft-delete |
| `created_at` | `timestamptz` | |

**Indexes:** `(installment_loan_id, payment_date)`, `(user_id)`

**Note:** `loan_ledger` is the loan domain's own event stream. `property_ledger.loan_payment` entries remain as a property cashflow concern — they represent the mortgage cost from the property's perspective and are not replaced by this table.

---

## Loan detail page

### Metrics strip (2 tiles)

| Tile | Content |
|---|---|
| Current balance | Latest balance snapshot amount + "as of {date}" |
| IO end date | Countdown in months (e.g. "14 months") + exact date; hidden or replaced with loan type when `loan_type = principal_and_interest` |

### Tabs

Two tabs: **Overview** and **Repayments**. Statements and Documents remain as stubs.

### Overview tab

Two-column layout.

**Left column — Loan terms (editable)**
- Lender
- Nickname (optional)
- Loan type (IO / P&I selector)
- Interest rate (optional, e.g. 6.35%)
- IO end date (optional, date field; visible when loan type is IO)
- Start date
- End date
- Security (read-only link to property)

**Right column — Balance history**
- List of balance snapshots (date + amount, newest first)
- Delta vs prior snapshot
- Inline "Add balance snapshot" form: date + amount

### Repayments tab

List of `loan_ledger` entries for this loan, newest first.

**Columns:** Date · Amount · Interest · Principal · Source (manual or document name)

**Summary footer:** Total paid, date range covered.

**Add repayment form (inline, bottom of list):**
- Date (required)
- Amount (required)
- Interest component (optional)
- Principal component (optional)

---

## Upload extension

Extend the existing upload flow to support loan bank statements as a document type, parsing entries into `loan_ledger`.

### Document type

New document category: `loan_statement` (alongside existing `pm_statement`).

### Extraction

New AI extraction prompt targeting loan statement fields:
- Payment date
- Total payment amount
- Interest component
- Principal component
- Closing balance (can cross-check with `installment_loan_balances`)

### Staging and matching

Follows the same staging pattern as PM statements:
- Extracted entries land in `document_staging_items` (or a new `loan_staging_items` table if fields diverge enough)
- Matching step links to an `installment_loan` (by lender name, account number, or user selection)
- User reviews and confirms before entries are written to `loan_ledger`

### Outstanding decision

Whether to reuse `document_staging_items` for loan statement staging (with nullable loan-specific fields) or introduce a `loan_staging_items` table. Deferred to planning — depends on how much the field shapes diverge.

---

## PR breakdown

| PR | Scope |
|---|---|
| PR 1 | Schema: `installment_loans` additions + `loan_ledger` table + RLS + migrations |
| PR 2 | Loan detail page: rebuilt Overview, Repayments tab with manual entry, API routes for `loan_ledger` |
| PR 3 | Upload extension: loan statement parsing, staging, matching, confirm → `loan_ledger` |

---

## Design prompts

Use these prompts with Claude Design to update `docs/visual-designs/loan.html` before implementation begins. The implementation should be based on the updated design, not the current over-scoped version.

---

### Prompt 1 — Simplify the Overview tab

> Update the Loan detail screen (`loan.html`).
>
> **Metrics strip:** Keep the Current balance tile. Replace the "Loan type" tile with an **IO end date countdown** tile showing months remaining as a large number (e.g. "14 months") with the exact date below. If the loan type is P&I (no IO period), show the loan type label instead.
>
> **Overview tab — replace the current three-column layout with a two-column layout:**
>
> Left column: **Loan terms** card (editable field list)
> - Lender
> - Nickname (optional)
> - Loan type: IO / P&I selector
> - Interest rate (optional, e.g. 6.35% — labelled "Rate (est.)")
> - IO end date (date field, only visible when type is IO)
> - Start date
> - Security (read-only, links to property)
>
> Right column: **Balance history** card
> - List of balance snapshots: date on left, amount on right, delta vs prior shown in subtle text below amount
> - "Add balance snapshot" inline form at the bottom: date + dollar amount fields + add button
>
> **Remove entirely from the Overview tab:**
> - The "Heads up / IO period rolling off" prompt banner
> - The balance trajectory chart
> - The Offset & redraw section
> - The Rate history section
> - The "Recent repayments" section at the bottom of the tab
>
> Keep the page header (breadcrumb, loan name, lender chip, entity badge, action buttons) unchanged.

---

### Prompt 2 — Build out the Repayments tab

> Update the Loan detail screen (`loan.html`).
>
> **Repayments tab:** Replace the empty placeholder with a fully designed tab.
>
> **Table columns:** Date · Amount · Interest · Principal · Source
> - Amount: shown as a negative number (e.g. −$2,167.00)
> - Interest and Principal: shown in muted text; display "—" when not recorded
> - Source: document name with a document icon if from an uploaded statement, or "Manual" in muted text
>
> **Summary footer** below the table:
> - Left: total paid for the visible period (e.g. "$26,004 paid · last 12 months")
> - Right: interest-only note if all entries have no principal (e.g. "100% interest")
>
> **Add repayment form** — inline section below the table, separated by a divider:
> - Heading: "Add repayment"
> - Fields in a compact grid: Date (required) · Amount $ (required) · Interest $ (optional) · Principal $ (optional)
> - Button: "+ Add repayment"
>
> Show 3–4 sample rows in the table using the existing CBA loan data (dates in Mar–Oct 2025 range, ~$2,167/mo, all interest / no principal since it's IO).

---

## Success criteria

- [ ] `installment_loans` has `loan_type`, `io_end_date`, `interest_rate` with migrations and RLS
- [ ] `loan_ledger` table exists with correct indexes, RLS, and soft-delete support
- [ ] Loan detail Overview tab shows new terms fields and balance history
- [ ] IO end date countdown visible in metrics strip when `loan_type = interest_only`
- [ ] Repayments tab shows `loan_ledger` entries and accepts manual entry
- [ ] Upload flow can accept a loan statement and route entries to `loan_ledger`
- [ ] `property_ledger.loan_payment` entries unaffected — existing cashflow reports still pass
- [ ] `pnpm test` passes, `pnpm test:integration` passes, `pnpm tsc --noEmit` passes
